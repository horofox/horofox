// x402 유료 엔드포인트 — 결제 없으면 402 페이월, 결제/데모 모드에서만 툴 실행
// X402_PAY_TO 미설정 = 데모 모드(무료 실행). 설정하면 base-sepolia exact 스킴으로 검증·정산

import { NextResponse } from "next/server";
import { portfolio } from "@/lib/ledger";
import { assets, midPrice } from "@/lib/hl/trade";
import { consume, subjectOf, CALLS_PER_PAYMENT } from "@/lib/quota";
import { identify } from "@/lib/auth";

export const runtime = "nodejs";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// 호출당 가격. USDC 는 6 decimals 이므로 1000 = $0.001.
// 랜딩에 표시하는 값과 반드시 같아야 한다 — 다르면 그건 거짓 광고다.
// 호출당 가격. USDC 는 6 decimals 이므로 10000 = $0.01.
//
// $0.001 로 시작했다가 올렸다. 실측한 원가가 호출당 $0.00379 였다
// (고정 프롬프트 1,166 토큰 + 도구 결과 + 출력 — scripts/_measure-prompt.ts).
// 즉 원가의 26% 에 팔고 있었고, 호출이 늘수록 손해가 커지는 구조였다.
// $0.01 은 원가의 약 2.6배다 — 에이전트에겐 여전히 싸고 우리는 마진이 남는다.
const PRICE_USDC = 0.01;
const MAX_AMOUNT = String(Math.round(PRICE_USDC * 1_000_000));

// 팔 만한 데이터는 Hyperliquid 에서 온다.
// 예전엔 CoinGecko 를 썼는데 공개 배포에서 403 으로 죽었다 — 무료 API 를
// 유료 엔드포인트의 원천으로 쓰면 남의 레이트리밋에 사업이 묶인다.
const TOOLS = {
  /** 퍼프 중간가. 코어 + HIP-3 전부. */
  price: async (params: URLSearchParams) => {
    const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) throw new Error("symbol 파라미터가 필요합니다");
    return { ok: true, symbol, midPrice: await midPrice(symbol), source: "hyperliquid" };
  },

  /** 거래 가능한 시장 목록. HIP-3 토큰화 자산이 여기 들어간다. */
  markets: async (params: URLSearchParams) => {
    const map = await assets();
    const uniq = [...new Set(map.values())];
    const dex = params.get("dex");
    const rows = uniq
      .filter((a) => (dex ? a.dex === dex : true))
      .map((a) => ({ symbol: a.symbol, dex: a.dex ?? "core", maxLeverage: a.maxLeverage }));
    return { ok: true, count: rows.length, markets: rows.slice(0, 400), source: "hyperliquid" };
  },

  /** 펀딩률. 어느 쪽이 지불하는지 — 에이전트가 실제로 사는 정보다. */
  funding: async (params: URLSearchParams) => {
    const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) throw new Error("symbol 파라미터가 필요합니다");
    const map = await assets();
    const a = map.get(symbol);
    if (!a) throw new Error(`Hyperliquid에 없는 심볼: ${symbol}`);
    const body = a.dex
      ? { type: "metaAndAssetCtxs", dex: a.dex }
      : { type: "metaAndAssetCtxs" };
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Hyperliquid 응답 오류: HTTP ${res.status}`);
    const [meta, ctxs] = (await res.json()) as [{ universe: { name: string }[] }, { funding: string; markPx: string }[]];
    const i = meta.universe.findIndex((u) => u.name === a.name);
    if (i < 0) throw new Error(`${symbol} 컨텍스트를 찾을 수 없습니다`);
    const hourly = Number(ctxs[i]!.funding);
    return {
      ok: true, symbol, hourly,
      annualisedPct: hourly * 24 * 365 * 100,
      // 부호의 의미를 명시한다 — 에이전트가 방향을 뒤집어 해석하면 돈을 잃는다
      paidBy: hourly >= 0 ? "longs pay shorts" : "shorts pay longs",
      markPrice: Number(ctxs[i]!.markPx),
      source: "hyperliquid",
    };
  },

  portfolio: async () => portfolio(),
} as const;

type ToolName = keyof typeof TOOLS;

function requirements(resource: string, payTo: string) {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: MAX_AMOUNT,
    resource,
    description: "Agent Terminal paid tool call",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_BASE_SEPOLIA,
    extra: { name: "USDC", version: "2" },
  };
}

async function payment402(resource: string) {
  const { verify } = await import("x402/verify");
  return NextResponse.json(
    {
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: [requirements(resource, process.env.X402_PAY_TO ?? "")],
      verifyAvailable: typeof verify === "function",
    },
    { status: 402 }
  );
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const toolName = (url.searchParams.get("tool") ?? "price") as ToolName;
  if (!(toolName in TOOLS)) {
    return NextResponse.json({ ok: false, error: `unknown tool: ${toolName}`, available: Object.keys(TOOLS) }, { status: 404 });
  }

  const resource = `${url.origin}/api/x402?tool=${toolName}`;
  const paymentHeader = req.headers.get("x-payment");

  // 무료 한도. 결제 헤더가 있으면 결제 경로로 보내고 한도를 소모하지 않는다 —
  // 돈을 낸 호출까지 무료분에서 깎으면 이중 과금이다.
  if (!paymentHeader) {
    const who = subjectOf(req, identify(req)?.userId ?? null);
    const q = await consume(who);
    if (!q.allowed) {
      return NextResponse.json(
        {
          x402Version: 1,
          error: "free quota exhausted",
          quota: { used: q.used, freeLimit: q.freeLimit, credits: q.credits },
          hint: `Settle over x402 to unlock ${CALLS_PER_PAYMENT} more calls.`,
        },
        { status: 402 },
      );
    }
  }

  // 데모 모드: 수취 주소 미설정 → 무료 실행
  if (!process.env.X402_PAY_TO) {
    try {
      const result = await TOOLS[toolName](url.searchParams);
      return NextResponse.json({ ...result, mode: "demo", note: "X402_PAY_TO 설정 시 유료 전환" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  if (!paymentHeader) return payment402(resource);

  // 결제 검증 + 정산 (base-sepolia exact)
  try {
    const { verify, settle } = await import("x402/verify");
    const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8")) as Record<string, unknown>;
    const payload = { x402Version: 1, scheme: "exact", network: "base-sepolia", payload: decoded };
    const reqs = requirements(resource, process.env.X402_PAY_TO);

    const verification = await verify(payload as never, reqs as never);
    if (!verification.isValid) {
      return NextResponse.json({ x402Version: 1, error: verification.invalidReason }, { status: 402 });
    }
    const settlement = await settle(payload as never, reqs as never);
    if (!settlement.success) {
      return NextResponse.json({ x402Version: 1, error: settlement.errorReason }, { status: 402 });
    }

    const result = await TOOLS[toolName](url.searchParams);
    return NextResponse.json({ ...result, mode: "paid", payer: verification.payer, transaction: settlement.transaction });
  } catch (e) {
    return NextResponse.json(
      { x402Version: 1, error: `payment verification failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 402 }
    );
  }
}

export const GET = handle;
export const POST = handle;
