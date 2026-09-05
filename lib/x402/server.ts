// x402 v2 — 리소스 서버.
//
// 왜 v2 인가: `x402@1.2.0` 은 2026-04 이후 배포가 없고, 생태계가 `@x402/*` v2 로 옮겨갔다.
// Hedera 지원은 v2 에만 있다. 우리는 v1 · base-sepolia 테스트넷에 남아 있어서
// **실제 결제를 받을 수 없는 상태**였다. 이 파일이 그걸 푼다.
//
// 프레임워크: 공식 PoC 는 Express 미들웨어(`@x402/express`)를 쓰는데 우리는 Next.js 라
// 프레임워크 비의존 진입점인 `x402HTTPResourceServer.processHTTPRequest` 를 직접 쓴다.
// 그래서 아래 어댑터가 필요하다 — Next 의 `Request` 를 코어가 아는 모양으로 바꾼다.

import { HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import type { HTTPAdapter, HTTPRequestContext } from "@x402/core/server";

export type HederaNetwork = "testnet" | "mainnet";

/**
 * 퍼실리테이터 URL.
 *
 * Hedera 공식 PoC 의 기본값과 동일하다. mainnet 이 Blocky402 인데,
 * ETHOnline Hedera 트랙 요건이 "Blocky402 로 정산"이라 **testnet 에서 Blocky402 가 되는지는 미확인**이다.
 * 그래서 환경변수로 덮어쓸 수 있게 열어둔다 — 확인되면 URL 만 바꾸면 된다.
 */
export function facilitatorUrl(network: HederaNetwork): string {
  const override = network === "mainnet"
    ? process.env.X402_MAINNET_FACILITATOR_URL
    : process.env.X402_TESTNET_FACILITATOR_URL;
  if (override) return override;
  return network === "mainnet" ? "https://api.blocky402.com" : "https://x402.org/facilitator";
}

/** 결제를 받을 Hedera 계정. 없으면 유료화가 꺼진다(데모 모드). */
export function payTo(network: HederaNetwork): string {
  return (network === "mainnet"
    ? process.env.HEDERA_MAINNET_ACCOUNT_ID
    : process.env.HEDERA_ACCOUNT_ID) ?? "";
}

export const NETWORK: HederaNetwork =
  process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";

/** 유료화가 실제로 켜져 있는가. 계정이 없으면 무료로 응답한다. */
export const isPaid = () => Boolean(payTo(NETWORK));

/**
 * 호출당 가격.
 *
 * $0.001 로 시작했다가 올렸다 — 실측 원가가 호출당 $0.00379 였다
 * (고정 프롬프트 1,166 토큰 + 도구 결과 + 출력. scripts/_measure-prompt.ts).
 * 원가의 26% 에 팔고 있었고 호출이 늘수록 손해가 커지는 구조였다.
 * $0.01 은 원가의 약 2.6배다.
 */
export const PRICE_USD = 0.01;

/** USDC 는 Money 문자열, HBAR 는 tinybar 단위 AssetAmount 로 표기한다 (PoC 규약). */
export const priceUsdc = () => `$${PRICE_USD}`;

/** Next 의 Request 를 코어가 아는 어댑터로 감싼다. */
export function nextAdapter(req: Request, body?: unknown): HTTPAdapter {
  const url = new URL(req.url);
  return {
    getHeader: (name) => req.headers.get(name) ?? undefined,
    getMethod: () => req.method,
    getPath: () => url.pathname,
    getUrl: () => req.url,
    getAcceptHeader: () => req.headers.get("accept") ?? "",
    getUserAgent: () => req.headers.get("user-agent") ?? "",
    getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
    getQueryParam: (name) => url.searchParams.get(name) ?? undefined,
    getBody: () => body,
  } as HTTPAdapter;
}

export function requestContext(req: Request, routePattern: string, body?: unknown): HTTPRequestContext {
  return {
    adapter: nextAdapter(req, body),
    path: new URL(req.url).pathname,
    method: req.method,
    paymentHeader: req.headers.get("payment-signature") ?? req.headers.get("x-payment") ?? undefined,
    routePattern,
  };
}

// 초기화는 퍼실리테이터에 지원 목록을 물어보는 네트워크 왕복이라 요청마다 하면 느리다.
// 한 번만 하고 재사용한다. 실패하면 다음 요청에서 다시 시도할 수 있게 캐시를 비운다.
let cached: Promise<x402HTTPResourceServer> | null = null;

export function resetServerCache(): void {
  cached = null;
}

/**
 * 유료 라우트 하나를 가진 HTTP 리소스 서버.
 *
 * @param routePattern 코어가 매칭할 라우트 키 (예: `GET /api/x402`)
 */
export function getHttpServer(routePattern: string): Promise<x402HTTPResourceServer> {
  if (cached) return cached;
  cached = (async () => {
    const core = new x402ResourceServer(
      new HTTPFacilitatorClient({ url: facilitatorUrl(NETWORK) }),
    ).register("hedera:*", new ExactHederaScheme({}));

    const http = new x402HTTPResourceServer(core, {
      [routePattern]: {
        accepts: [{
          scheme: "exact",
          price: priceUsdc(),
          network: `hedera:${NETWORK}`,
          payTo: payTo(NETWORK),
        }],
        description: "Hyperliquid market data — priced per query, no account required",
        mimeType: "application/json",
      },
    });
    await http.initialize();
    return http;
  })().catch((e) => {
    cached = null;   // 다음 요청이 다시 시도할 수 있게
    throw e;
  });
  return cached;
}
