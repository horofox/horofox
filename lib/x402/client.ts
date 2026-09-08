// x402 클라이언트 — 에이전트가 **사는** 쪽.
//
// 지금까지 우리는 파는 쪽만 있었다. 402 를 내고 결제를 받았지만,
// 우리 에이전트가 남의 유료 API 를 결제해서 쓰는 경로는 없었다.
//
// 이게 있어야 루프가 닫힌다:
//   거래 수수료를 번다 → 크레딧이 된다 → **그 돈으로 데이터를 산다** → 답한다
//
// 조사한 필드(리스본·HackMoney 전수)에서 에이전트 결제 프로젝트는 전부 쓰는 쪽만 다룬다.
// 버는 쪽과 쓰는 쪽이 같은 시스템 안에 있는 팀이 없다 — 거기가 우리 자리다.

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner } from "@x402/hedera";
import { PrivateKey } from "@hiero-ledger/sdk";
import { NETWORK, type HederaNetwork } from "./server";

/** 결제 과정의 단계. 데모에서 이 전이를 그대로 보여준다 — 말이 아니라 상태로 증명한다. */
export type PayStage =
  | "requesting"        // 최초 요청
  | "payment_required"  // 402 받음, 요구사항 파싱
  | "signing"           // Hedera 트랜잭션 서명
  | "settling"          // 퍼실리테이터가 공동서명·제출
  | "paid"              // 200 — 결제 완료, 응답 도착
  | "refused";          // 예산 초과 등으로 우리가 결제를 거부

export type PayEvent = { stage: PayStage; detail?: string; amountUsd?: number };

/** 결제에 쓸 지갑이 설정돼 있는가. 없으면 무료 경로만 쓴다. */
export function canPay(): boolean {
  return Boolean(process.env.HEDERA_AGENT_ACCOUNT_ID && process.env.HEDERA_AGENT_PRIVATE_KEY);
}

export function agentAccountId(): string {
  return process.env.HEDERA_AGENT_ACCOUNT_ID ?? "";
}

function buildClient(network: HederaNetwork = NETWORK): x402Client {
  const accountId = process.env.HEDERA_AGENT_ACCOUNT_ID;
  const key = process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!accountId || !key) {
    throw new Error(
      "결제할 지갑이 없습니다.\n" +
        "1) portal.hedera.com 에서 테스트넷 계정 생성 (ECDSA)\n" +
        "2) .env.local 에 추가: HEDERA_AGENT_ACCOUNT_ID=0.0.xxxxx HEDERA_AGENT_PRIVATE_KEY=0x...\n" +
        "이 키는 **결제 전용**이며 거래 서명 키(TRADER_KEY)와 별개다.",
    );
  }
  const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(key), {
    network: `hedera:${network}`,
  });
  return new x402Client().register(`hedera:${network}`, new ExactHederaScheme(signer));
}

/**
 * 결제 가능한 fetch.
 *
 * 402 를 만나면 스스로 서명해 재요청한다. `onStage` 로 각 단계를 흘려보내
 * 호출부가 진행 상황을 보여줄 수 있게 한다 — 데모에서 이게 핵심이다.
 *
 * `budgetGate` 는 결제 직전에 물어보는 훅이다. false 를 돌려주면 결제하지 않는다.
 * 예산 통제를 결제 라이브러리 바깥에 두는 이유: 한도를 라이브러리가 아니라
 * **우리 원장**이 결정해야 하기 때문이다 (lib/social/budget.ts 와 같은 이유).
 */
export function payingFetch(opts: {
  onStage?: (e: PayEvent) => void;
  budgetGate?: (amountUsd: number) => Promise<boolean> | boolean;
  network?: HederaNetwork;
} = {}): typeof fetch {
  const { onStage = () => {}, budgetGate, network = NETWORK } = opts;
  const client = buildClient(network);

  // 402 를 가로채 단계를 알리고 예산을 확인한 뒤, 통과하면 결제 계층에 넘긴다.
  const observed: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const isRetry = req.headers.has("PAYMENT-SIGNATURE") || req.headers.has("X-PAYMENT");

    if (isRetry) {
      onStage({ stage: "settling" });
      const res = await globalThis.fetch(input as RequestInfo, init);
      onStage({ stage: res.ok ? "paid" : "refused", detail: res.ok ? undefined : `HTTP ${res.status}` });
      return res;
    }

    onStage({ stage: "requesting" });
    const res = await globalThis.fetch(input as RequestInfo, init);
    if (res.status !== 402) return res;

    const amountUsd = priceFromResponse(res);
    onStage({ stage: "payment_required", amountUsd });

    if (budgetGate) {
      const ok = await budgetGate(amountUsd);
      if (!ok) {
        onStage({ stage: "refused", detail: `예산이 허락하지 않습니다 ($${amountUsd})`, amountUsd });
        // 402 를 그대로 돌려준다. 삼키면 호출부가 결제된 줄 안다.
        return res;
      }
    }

    onStage({ stage: "signing", amountUsd });
    return res;
  };

  return wrapFetchWithPayment(observed, client);
}

/** 402 응답에서 청구 금액(USD)을 읽는다. 헤더가 정본이고 본문은 보조다. */
export function priceFromResponse(res: Response): number {
  const enc = [...res.headers].find(([k]) => k.toLowerCase() === "payment-required")?.[1];
  if (!enc) return 0;
  try {
    const j = JSON.parse(Buffer.from(enc, "base64").toString("utf8")) as {
      accepts?: { amount?: string; asset?: string }[];
    };
    const a = j.accepts?.[0];
    if (!a?.amount) return 0;
    // USDC 는 6 decimals. 자산이 다르면 단위가 달라지므로 그때는 0 을 돌려주고
    // 호출부가 판단하게 둔다 — 틀린 금액으로 예산을 통과시키는 것보다 낫다.
    if (a.asset && a.asset !== "0.0.0" && /^\d+\.\d+\.\d+$/.test(a.asset)) {
      return Number(a.amount) / 1_000_000;
    }
    return 0;
  } catch {
    return 0;
  }
}
