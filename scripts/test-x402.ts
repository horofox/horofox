// G3 — x402 유료 API. 죽어 있던 걸 살렸는지, 규격을 지키는지.
import "../lib/env";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";

const PORT = 3472;

async function waitReady(url: string, ms = 180_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).status < 500) return true; } catch { /* 대기 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  // 원가 방어선. 한 번 원가 아래로 팔다가 뒤늦게 발견한 적이 있어 테스트로 막는다.
  // 원가 근거: 고정 프롬프트 1,166 토큰(시스템 101 + 도구 13개 1,065) + 도구 결과 800 + 출력 456,
  // 요율 $0.001/1k(입력)·$0.004/1k(출력) → $0.00379/호출. scripts/_measure-prompt.ts 로 재측정 가능.
  const MEASURED_COST_PER_CALL = 0.00379;

  let fail = 0;
  const t = (n: string, ok: boolean, x = "") => { if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); };

  console.log("가격 일관성 (코드 ↔ 랜딩)");
  const src = await fs.readFile("app/api/x402/route.ts", "utf8");
  // v2 이후 가격 상수는 결제 계층으로 옮겨갔다.
  const x402lib = await fs.readFile("lib/x402/server.ts", "utf8");
  const dict = await fs.readFile("lib/i18n.ts", "utf8");
  const landing = await fs.readFile("app/page.tsx", "utf8");
  const price = Number(/PRICE_USD = ([\d.]+)/.exec(x402lib)?.[1]);
  t("코드에 가격 상수 존재", Number.isFinite(price), `$${price}`);
  t("랜딩 표시가와 일치", landing.includes(`$${price}`), `랜딩=$${price}`);
  t("가격이 실측 원가보다 높다 (팔수록 손해가 아니어야 한다)",
    price > MEASURED_COST_PER_CALL,
    `$${price} vs 원가 $${MEASURED_COST_PER_CALL} — ${(price / MEASURED_COST_PER_CALL).toFixed(2)}배`);
  // v2 는 Money 문자열($0.01)로 값을 넘긴다 — v1 처럼 6 decimals 정수로 손수 환산하지 않는다.
  t("가격을 Money 문자열로 표기", x402lib.includes("`$${PRICE_USD}`") || x402lib.includes("priceUsdc"));
  void dict;

  // 데모 모드 (X402_PAY_TO 미설정) 로 띄운다
  // 툴 검증에는 쿼터가 방해되므로 넉넉히 준다.
  // 쿼터 자체는 아래에서 따로, 낮은 한도로 확인한다.
  // 데모 모드는 HEDERA_ACCOUNT_ID 가 비어 있어야 한다 — payTo() 가 읽는 건 이 변수다.
  const env = { ...process.env, X402_PAY_TO: "", HEDERA_ACCOUNT_ID: "", HL_MODE: "paper", FREE_CALLS_PER_DAY: "500" };
  const srv = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: "ignore", detached: true });
  const cleanup = () => { try { process.kill(-srv.pid!, "SIGKILL"); } catch { /* 종료됨 */ } };
  process.on("exit", cleanup);

  try {
    const base = `http://127.0.0.1:${PORT}/api/x402`;
    if (!await waitReady(`${base}?tool=price&symbol=BTC`)) { console.log("\nX402 FAIL — 서버 미기동"); cleanup(); process.exit(1); }

    console.log("\n툴 (Hyperliquid 기반 — CoinGecko 403 으로 죽던 걸 교체)");
    const price1 = await (await fetch(`${base}?tool=price&symbol=BTC`)).json() as { ok?: boolean; midPrice?: number; source?: string };
    t("price: BTC", price1.ok === true && (price1.midPrice ?? 0) > 1000, `$${price1.midPrice}`);
    t("출처가 hyperliquid", price1.source === "hyperliquid");

    const skhx = await (await fetch(`${base}?tool=price&symbol=SKHX`)).json() as { ok?: boolean; midPrice?: number };
    t("price: SKHX (HIP-3)", skhx.ok === true && (skhx.midPrice ?? 0) > 0, `$${skhx.midPrice}`);

    const mk = await (await fetch(`${base}?tool=markets`)).json() as { ok?: boolean; count?: number };
    t("markets: 자산 목록", mk.ok === true && (mk.count ?? 0) > 200, `${mk.count}종`);

    const mkx = await (await fetch(`${base}?tool=markets&dex=xyz`)).json() as { count?: number };
    t("markets: dex 필터", (mkx.count ?? 0) > 50 && (mkx.count ?? 0) < (mk.count ?? 0), `xyz=${mkx.count}`);

    const fd = await (await fetch(`${base}?tool=funding&symbol=SKHX`)).json() as { ok?: boolean; annualisedPct?: number; paidBy?: string };
    t("funding: 펀딩률", fd.ok === true && Number.isFinite(fd.annualisedPct), `${fd.annualisedPct?.toFixed(1)}%`);
    t("funding: 지불 방향 명시", /pay/.test(fd.paidBy ?? ""), fd.paidBy);

    console.log("\n오류 처리");
    t("없는 툴 → 404", (await fetch(`${base}?tool=nope`)).status === 404);
    const noSym = await fetch(`${base}?tool=price`);
    t("symbol 누락 → 4xx/5xx 로 명확히", noSym.status >= 400, `HTTP ${noSym.status}`);
    const badSym = await (await fetch(`${base}?tool=funding&symbol=NOTACOIN`)).json() as { ok?: boolean; error?: string };
    t("없는 심볼 → 이유 반환", badSym.ok === false && (badSym.error ?? "").length > 0);

    console.log("\n402 페이월 (수취 주소 설정 시)");
    // 데모 모드에서는 무료 실행이 정상 — 그 사실 자체를 확인한다
    t("데모 모드에서는 402 없이 실행", price1.ok === true);
    t("페이월 코드가 존재", src.includes("x402Version") && src.includes("402"));
    t("스킴·네트워크 명시 (v2 · Hedera)",
      x402lib.includes('scheme: "exact"') && x402lib.includes("hedera:"),
      "hedera:testnet|mainnet");
    // 주석에 남은 이력은 하드코딩이 아니다 — 왜 옮겼는지의 기록이라 지우면 손해다. 실행되는 줄만 본다.
    const code = (x: string) => x.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    t("테스트넷 하드코딩이 실행 코드에서 사라졌다",
      !code(src).includes("base-sepolia") && !code(x402lib).includes("base-sepolia"));
    t("퍼실리테이터 URL 이 네트워크별로 갈린다",
      x402lib.includes("api.blocky402.com") && x402lib.includes("x402.org/facilitator"));

    console.log("\n유료 모드 — 수취 계정을 넣으면 실제로 402 를 내는가");
    // 데모 모드만 보면 결제 계층이 죽어 있어도 통과한다. 계정을 넣고 진짜로 띄운다.
    const P3 = PORT + 2;
    // 무료 허용량이 남아 있으면 결제를 요구하지 않는다(정상 동작). 결제 경로를 보려면 0 이어야 한다.
    const paidEnv = { ...process.env, HEDERA_ACCOUNT_ID: "0.0.123456", HEDERA_NETWORK: "testnet", FREE_CALLS_PER_DAY: "0" };
    const srv3 = spawn("npx", ["next", "dev", "-p", String(P3)], { env: paidEnv, stdio: "ignore", detached: true });
    try {
      const u3 = `http://127.0.0.1:${P3}/api/x402?tool=price&symbol=BTC`;
      let res: Response | null = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 180_000) {
        try { res = await fetch(u3); break; } catch { /* 서버 기동 대기 */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
      t("유료 모드에서 402 반환", res?.status === 402, `HTTP ${res?.status}`);
      const hdr = [...(res?.headers ?? new Headers())].find(([k]) => k.toLowerCase() === "payment-required")?.[1];
      t("PAYMENT-REQUIRED 헤더 존재 (v2 규격)", Boolean(hdr));
      const b = (await res?.json()) as { x402Version?: number; accepts?: { network?: string; amount?: string; asset?: string; extra?: { feePayer?: string } }[] } | undefined;
      const a = b?.accepts?.[0];
      t("x402Version 2", b?.x402Version === 2, String(b?.x402Version));
      t("네트워크가 Hedera", a?.network === "hedera:testnet", a?.network ?? "");
      t("금액이 가격과 일치", a?.amount === String(Math.round(price * 1_000_000)), `${a?.amount} (기대 ${Math.round(price * 1_000_000)})`);
      // feePayer 는 퍼실리테이터가 채워준다. 이게 있으면 퍼실리테이터가 실제로 응답했다는 뜻이다.
      t("퍼실리테이터가 응답했다 (feePayer 존재)", Boolean(a?.extra?.feePayer), a?.extra?.feePayer ?? "없음");
    } finally { try { process.kill(-srv3.pid!, "SIGKILL"); } catch { /* 종료됨 */ } }

    console.log("\n쿼터 — 무료 한도를 넘으면 402 로 결제를 요구하는가");
    // 낮은 한도로 별도 인스턴스를 띄워 소진까지 확인한다
    const P2 = PORT + 1;
    const srv2 = spawn("npx", ["next", "dev", "-p", String(P2)],
      { env: { ...process.env, X402_PAY_TO: "", HEDERA_ACCOUNT_ID: "", HL_MODE: "paper", FREE_CALLS_PER_DAY: "2", HL_QUOTA_SUFFIX: String(Date.now()) },
        stdio: "ignore", detached: true });
    try {
      const b2 = `http://127.0.0.1:${P2}/api/x402?tool=price&symbol=BTC`;
      if (await waitReady(b2)) {
        // 이미 소진돼 있을 수 있으므로 상태를 먼저 읽는다
        const q0 = await (await fetch(`http://127.0.0.1:${P2}/api/v1/quota`)).json() as { remaining?: number; freeLimit?: number };
        t("/api/v1/quota 가 상태를 알려줌", typeof q0.remaining === "number", `remaining=${q0.remaining} limit=${q0.freeLimit}`);
        // 남은 만큼 + 여유분을 소모시킨다
        let last = 200;
        for (let i = 0; i < (q0.remaining ?? 0) + 3; i++) last = (await fetch(b2)).status;
        t("한도 초과 시 402", last === 402, `마지막 HTTP ${last}`);
        const body = await (await fetch(b2)).json() as { error?: string; hint?: string };
        t("402 응답이 이유와 해결책을 담음", /quota/i.test(body.error ?? "") && /x402/i.test(body.hint ?? ""));
      } else {
        t("쿼터 검증 서버 기동", false);
      }
    } finally {
      try { process.kill(-srv2.pid!, "SIGKILL"); } catch { /* 종료됨 */ }
    }

    console.log(fail === 0 ? "\nX402 OK — 유료 API 동작" : `\nX402 FAIL — ${fail}건`);
  } finally { cleanup(); }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("X402 FAIL —", e instanceof Error ? e.message : e); process.exit(1); });
