// x402 유료 엔드포인트 — 결제 없으면 402, 결제되면 툴 실행.
//
// v1(`x402@1.2.0` · base-sepolia)에서 **v2(`@x402/core` · Hedera)로 이전했다.**
// 이유 둘:
//   1. v1 은 2026-04 이후 배포가 없고 생태계가 @x402/* v2 로 옮겨갔다.
//   2. base-sepolia 는 테스트넷이라 **진짜 돈을 받을 수 없었다.**
//
// 결제 계층만 바꿨다. 아래 TOOLS 의 데이터 로직은 그대로다.

import { NextResponse } from "next/server";
import { portfolio } from "@/lib/ledger";
import { assets, midPrice } from "@/lib/hl/trade";
import { annualisedPct, gatherInsights } from "@/lib/insights";
import { classify } from "@/lib/coverage";
import { consume, subjectOf, CALLS_PER_PAYMENT } from "@/lib/quota";
import { identify } from "@/lib/auth";
import { getHttpServer, requestContext, isPaid, NETWORK, PRICE_USD, facilitatorUrl } from "@/lib/x402/server";

export const runtime = "nodejs";

/** 코어가 라우트를 매칭하는 키. 쿼리스트링은 포함하지 않는다. */
const ROUTE = "GET /api/x402";

async function fundingSnapshot(symbol: string) {
  const asset = (await assets()).get(symbol);
  if (!asset) throw new Error(`Hyperliquid에 없는 심볼: ${symbol}`);
  const body = asset.dex
    ? { type: "metaAndAssetCtxs", dex: asset.dex }
    : { type: "metaAndAssetCtxs" };
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Hyperliquid 응답 오류: HTTP ${response.status}`);
  const [meta, contexts] = (await response.json()) as [
    { universe: { name: string }[] },
    { funding: string; markPx: string }[],
  ];
  const index = meta.universe.findIndex(({ name }) => name === asset.name);
  const context = contexts[index];
  if (index < 0 || !context) throw new Error(`${symbol} 컨텍스트를 찾을 수 없습니다`);
  const hourly = Number(context.funding);
  return {
    asset,
    hourly,
    annualisedPct: annualisedPct(hourly),
    paidBy: hourly >= 0 ? "longs pay shorts" : "shorts pay longs",
    markPrice: Number(context.markPx),
  };
}

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
    const snapshot = await fundingSnapshot(symbol);
    return {
      ok: true, symbol, hourly: snapshot.hourly,
      annualisedPct: snapshot.annualisedPct,
      // 부호의 의미를 명시한다 — 에이전트가 방향을 뒤집어 해석하면 돈을 잃는다
      paidBy: snapshot.paidBy,
      markPrice: snapshot.markPrice,
      source: "hyperliquid",
    };
  },

  brief: async (params: URLSearchParams) => {
    const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) throw new Error("symbol 파라미터가 필요합니다");
    const rawLimit = params.get("limit") ?? "10";
    const limit = Number(rawLimit);
    if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new Error("limit은 1에서 10 사이의 정수여야 합니다");
    }
    const rawEquitiesOnly = params.get("equitiesOnly") ?? "true";
    if (rawEquitiesOnly !== "true" && rawEquitiesOnly !== "false") {
      throw new Error("equitiesOnly는 true 또는 false여야 합니다");
    }
    const equitiesOnly = rawEquitiesOnly === "true";
    const [insights, snapshot] = await Promise.all([
      gatherInsights(limit, equitiesOnly),
      fundingSnapshot(symbol),
    ]);
    if (!snapshot.asset.dex || (equitiesOnly && classify(snapshot.asset) !== "equity")) {
      throw new Error(`${symbol}은 요청한 HIP-3 범위에 없습니다`);
    }
    const funding = [...insights.topFunding, ...insights.bottomFunding]
      .find((row) => row.symbol.toUpperCase() === symbol);
    return {
      ok: true,
      symbol,
      dex: snapshot.asset.dex,
      perpCaveat: "Perpetual future, not a share; no ownership, voting, or dividends.",
      price: funding?.markPx ?? snapshot.markPrice,
      hourly: funding?.hourly ?? snapshot.hourly,
      annualisedPct: funding?.annualisedPct ?? snapshot.annualisedPct,
      paidBy: funding
        ? funding.hourly >= 0 ? "longs pay shorts" : "shorts pay longs"
        : snapshot.paidBy,
      maxLeverage: snapshot.asset.maxLeverage,
      measuredAt: insights.measuredAt,
      source: "hyperliquid",
    };
  },

  portfolio: async () => portfolio(),
} as const;

type ToolName = keyof typeof TOOLS;

async function runTool(toolName: ToolName, params: URLSearchParams) {
  return TOOLS[toolName](params);
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const toolName = (url.searchParams.get("tool") ?? "price") as ToolName;
  if (!(toolName in TOOLS)) {
    return NextResponse.json(
      { ok: false, error: `unknown tool: ${toolName}`, available: Object.keys(TOOLS) },
      { status: 404 },
    );
  }

  const paymentHeader = req.headers.get("payment-signature") ?? req.headers.get("x-payment");
  const paidMode = isPaid();

  // 무료 한도. 결제 헤더가 있으면 결제 계층이 처리하므로 한도를 건드리지 않는다 —
  // 돈을 낸 호출까지 무료분에서 깎으면 이중 과금이다.
  const who = subjectOf(req, identify(req)?.userId ?? null);

  // 데모 모드: 수취 계정이 없어 검증할 결제 계층 자체가 없다.
  // 결제처럼 보이는 헤더는 신뢰할 근거가 없으므로 무시하고 무료 한도만 적용한다.
  if (!paidMode) {
    const q = await consume(who);
    if (!q.allowed) {
      return NextResponse.json(
        {
          x402Version: 2,
          error: "free quota exhausted",
          quota: { used: q.used, freeLimit: q.freeLimit, credits: q.credits },
          hint: `Set HEDERA_ACCOUNT_ID to enable x402 payment, or settle for ${CALLS_PER_PAYMENT} more calls.`,
        },
        { status: 402 },
      );
    }
    if (paymentHeader) {
      return NextResponse.json(
        { x402Version: 2, error: "payment verification unavailable" },
        { status: 402 },
      );
    }
    try {
      return NextResponse.json({
        ...(await runTool(toolName, url.searchParams)),
        mode: "demo",
        note: `HEDERA_ACCOUNT_ID 설정 시 유료 전환 (hedera:${NETWORK})`,
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  // 유료 모드. 결제 헤더가 있으면 한도를 건드리지 않고 결제 계층에 넘긴다 —
  // 돈을 낸 호출까지 무료분에서 깎으면 이중 과금이다.
  if (!paymentHeader) {
    const q = await consume(who);
    if (q.allowed) {
      // 허용량이 남았으면 그냥 준다 — llms.txt 가 약속한 "결제 전에 먼저 써보기"다.
      try {
        return NextResponse.json({
          ...(await runTool(toolName, url.searchParams)),
          mode: "free-allowance",
          remaining: q.remaining,
        });
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
      }
    }
    // 소진. **여기서 막지 않는다** — 아래 결제 계층이 `PAYMENT-REQUIRED` 헤더를 실은
    // 402 를 만든다. 여기서 돌려주면 "x402 로 내라"고 하면서 낼 대상은 주지 않는
    // 402 가 되어, 에이전트가 결제할 방법이 없다.
  }

  // 유료 경로 — 코어가 402 생성·검증·정산을 전부 처리한다.
  // 우리는 그 판정에 따라 툴을 실행할지만 정한다.
  try {
    const http = await getHttpServer(ROUTE);
    const context = requestContext(req, ROUTE);
    const result = await http.processHTTPRequest(context);

    if (result.type === "payment-error") {
      const r = result.response;
      // v2 는 결제 요구사항을 `payment-required` **헤더**에 base64 로 싣는다. 본문은 비어 있는 게 정상이다.
      // 헤더가 규격상 정본이므로 그대로 통과시키되, 사람이 curl 로 볼 때 빈 `{}` 만 보이면
      // 디버깅이 불가능하므로 같은 내용을 본문에도 풀어 넣는다.
      // 헤더 키 대소문자는 코어 구현에 달렸다(실측: "PAYMENT-REQUIRED"). 고정하지 않고 찾는다.
      const encoded = Object.entries(r.headers ?? {})
        .find(([k]) => k.toLowerCase() === "payment-required")?.[1];
      let body = r.body as unknown;
      if ((!body || Object.keys(body as object).length === 0) && typeof encoded === "string") {
        try {
          body = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
        } catch {
          body = { x402Version: 2, error: "payment required" };
        }
      }
      return NextResponse.json(body ?? { x402Version: 2, error: "payment required" }, {
        status: r.status,
        headers: r.headers,
      });
    }

    if (result.type === "payment-verified") {
      let data: Awaited<ReturnType<typeof runTool>>;
      try {
        data = await runTool(toolName, url.searchParams);
      } catch (error) {
        const canceled = await result.cancellationDispatcher.cancel({ reason: "handler_threw", error });
        const headers = http.createFailurePathSettlementHeaders(
          canceled,
          result.beforeHandlerSettlement,
          result.paymentPayload,
        );
        return NextResponse.json(
          {
            x402Version: 2,
            error: `payment layer failed: ${error instanceof Error ? error.message : String(error)}`,
            facilitator: facilitatorUrl(NETWORK),
          },
          { status: 400, headers },
        );
      }

      const settlement = await http.processSettlement(
        result.paymentPayload,
        result.paymentRequirements,
        result.declaredExtensions,
        { request: context, responseBody: Buffer.from(JSON.stringify(data)) },
        undefined,
        result.beforeHandlerSettlement,
      );
      if (!settlement.success) {
        const responseBody = typeof settlement.response.body === "string"
          ? settlement.response.body
          : JSON.stringify(settlement.response.body ?? {});
        return new Response(responseBody, {
          status: settlement.response.status,
          headers: settlement.response.headers,
        });
      }

      return NextResponse.json({
        ...data,
        mode: "paid",
        network: `hedera:${NETWORK}`,
        payer: settlement.payer ?? (result.paymentPayload as { payload?: { from?: string } }).payload?.from,
        transaction: settlement.transaction,
      }, { headers: settlement.headers });
    }
    const data = await runTool(toolName, url.searchParams);
    return NextResponse.json({ ...data, mode: "free" });
  } catch (e) {
    return NextResponse.json(
      {
        x402Version: 2,
        error: `payment layer failed: ${e instanceof Error ? e.message : String(e)}`,
        facilitator: facilitatorUrl(NETWORK),
      },
      { status: 502 },
    );
  }
}


export const GET = handle;
export const POST = handle;
