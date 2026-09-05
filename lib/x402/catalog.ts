// 서비스 카탈로그 — 발견 계층의 단일 출처.
//
// `/.well-known/x402`, `llms.txt`, `openapi.json` 셋이 같은 내용을 서로 다른 형식으로 낸다.
// 세 곳에 따로 적으면 반드시 어긋난다 — 툴을 하나 추가했는데 매니페스트만 안 고치는 식으로.
// 그래서 여기 한 번만 적고 셋이 전부 여기서 생성된다. 테스트가 그 일치를 강제한다.
//
// 왜 이게 필요한가: 지금 우리 API 는 존재하지만 **에이전트가 찾을 방법이 없다.**
// 살아 있는 x402 서비스는 예외 없이 이 세 파일을 갖고 있고, 그게 발견의 전부다.

import { PRICE_USD, NETWORK } from "./server";

export type ToolSpec = {
  name: string;
  summary: string;
  /** 에이전트가 "이걸 왜 사야 하는가"를 판단할 근거. 기능이 아니라 쓸모를 적는다. */
  whyPaid: string;
  params: { name: string; required: boolean; description: string; example?: string }[];
  returns: string;
};

export const SERVICE = {
  name: "horofox — Hyperliquid market data",
  description:
    "Per-query market data for Hyperliquid perpetuals, including HIP-3 tokenized equities, " +
    "indices and pre-IPO markets that most price APIs do not carry. Pay per call over x402 — " +
    "no account, no API key, no subscription.",
  baseUrl: () => process.env.PUBLIC_SITE_URL ?? "https://horofox.com",
  contact: "support@horofox.com",
} as const;

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "price",
    summary: "Mid price for any Hyperliquid perp, core or HIP-3.",
    whyPaid:
      "Covers assets free price APIs miss — tokenized equities (TSLA, NVDA, AAPL), " +
      "indices (US500, USTECH), and pre-IPO markets (ANTH, OAI) that only exist on HIP-3 dexes.",
    params: [
      { name: "symbol", required: true, description: "Ticker without the dex prefix.", example: "NVDA" },
    ],
    returns: "{ ok, symbol, midPrice, source }",
  },
  {
    name: "markets",
    summary: "Every tradable market, with its dex and max leverage.",
    whyPaid:
      "Resolves which HIP-3 dex actually lists a symbol. Six of the ten HIP-3 dexes are dormant, " +
      "so a symbol existing somewhere does not mean it is tradable.",
    params: [
      { name: "dex", required: false, description: "Filter to one dex, or omit for all.", example: "xyz" },
    ],
    returns: "{ ok, count, markets: [{ symbol, dex, maxLeverage }], source }",
  },
  {
    name: "funding",
    summary: "Current funding rate, hourly and annualised, with who pays whom.",
    whyPaid:
      "Funding on tokenized equity perps runs far wider than on crypto majors and is not " +
      "published by conventional market-data vendors. The direction is stated explicitly so an " +
      "agent cannot invert the sign.",
    params: [
      { name: "symbol", required: true, description: "Ticker without the dex prefix.", example: "ANTH" },
    ],
    returns: "{ ok, symbol, hourly, annualisedPct, paidBy, markPrice, source }",
  },
  {
    name: "portfolio",
    summary: "Balances and open positions for the calling account.",
    whyPaid: "Lets an agent check its own state on the same rail it trades through.",
    params: [],
    returns: "{ balances, positions }",
  },
];

/** `/.well-known/x402` 본문. 실서비스들이 쓰는 형식을 따른다. */
export function manifest() {
  const base = SERVICE.baseUrl();
  return {
    x402Version: 2,
    name: SERVICE.name,
    description: SERVICE.description,
    openapi: `${base}/openapi.json`,
    llms: `${base}/llms.txt`,
    resources: TOOL_SPECS.map((t) => ({
      url: `${base}/api/x402?tool=${t.name}`,
      method: "GET",
      description: t.summary,
      accepts: [{
        scheme: "exact",
        network: `hedera:${NETWORK}`,
        price: `$${PRICE_USD}`,
        payTo: process.env.HEDERA_ACCOUNT_ID ?? "",
        asset: "USDC",
      }],
    })),
  };
}

/** `llms.txt` — 사람이 아니라 모델이 읽는 설명서. */
export function llmsTxt(): string {
  const base = SERVICE.baseUrl();
  const tools = TOOL_SPECS.map((t) => {
    const params = t.params.length
      ? t.params.map((p) => `  - \`${p.name}\`${p.required ? " (required)" : " (optional)"} — ${p.description}${p.example ? ` e.g. \`${p.example}\`` : ""}`).join("\n")
      : "  - none";
    return `### ${t.name}\n\n${t.summary}\n\n**Why it is worth paying for:** ${t.whyPaid}\n\nParameters:\n${params}\n\nReturns \`${t.returns}\`\n\n\`\`\`\nGET ${base}/api/x402?tool=${t.name}${t.params.filter(p=>p.example).map((p,i)=>`${i===0?"&":"&"}${p.name}=${p.example}`).join("")}\n\`\`\``;
  }).join("\n\n");

  return `# ${SERVICE.name}

> ${SERVICE.description}

## How to use

1. Call any endpoint below. Without payment you get HTTP 402 with x402 payment
   requirements in the \`PAYMENT-REQUIRED\` header (base64 JSON) and in the body.
2. Sign the payment and retry with a \`PAYMENT-SIGNATURE\` header.
3. On Hedera the facilitator co-signs and pays gas, so you do not need HBAR for fees —
   only the ${`$${PRICE_USD}`} in USDC.

Price is ${`$${PRICE_USD}`} per call on \`hedera:${NETWORK}\`. There is a small free
allowance per caller before payment is required, so you can try an endpoint before paying.

## What is different about this data

Prices come straight from Hyperliquid, including its HIP-3 dexes. That matters because
HIP-3 is where tokenized equities, indices and pre-IPO markets live — instruments most
market-data APIs do not carry at all.

Caveats you should surface to your user rather than hide:

- These are **perpetual futures**, not shares. No ownership, no voting, no dividends.
- Pre-IPO markets (e.g. \`ANTH\`, \`OAI\`) price an **implied valuation**, not a share price,
  and have traded far above the last private funding round. The referenced companies do not
  endorse these instruments.
- Six of the ten HIP-3 dexes are dormant. Use \`markets\` to check a symbol is actually live.

## Endpoints

${tools}

## Contact

${SERVICE.contact}
`;
}

/** OpenAPI 3.1 문서. 툴 하나에 경로 하나로 편다. */
export function openapi() {
  const base = SERVICE.baseUrl();
  const paths: Record<string, unknown> = {};
  for (const t of TOOL_SPECS) {
    paths[`/api/x402?tool=${t.name}`] = {
      get: {
        summary: t.summary,
        description: `${t.whyPaid}\n\nReturns ${t.returns}`,
        operationId: t.name,
        parameters: [
          { name: "tool", in: "query", required: true, schema: { type: "string", enum: [t.name] } },
          ...t.params.map((p) => ({
            name: p.name,
            in: "query",
            required: p.required,
            description: p.description,
            schema: { type: "string", ...(p.example ? { example: p.example } : {}) },
          })),
        ],
        responses: {
          "200": { description: "Result", content: { "application/json": { schema: { type: "object" } } } },
          "402": {
            description:
              "Payment required. Requirements are in the PAYMENT-REQUIRED header (base64 JSON) and mirrored in the body.",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "400": { description: "Bad or missing parameter" },
          "404": { description: "Unknown tool" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: SERVICE.name,
      description: SERVICE.description,
      version: "2.0.0",
      contact: { email: SERVICE.contact },
    },
    servers: [{ url: base }],
    paths,
  };
}
