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
  const dict = await fs.readFile("lib/i18n.ts", "utf8");
  const landing = await fs.readFile("app/page.tsx", "utf8");
  const price = Number(/PRICE_USDC = ([\d.]+)/.exec(src)?.[1]);
  t("코드에 가격 상수 존재", Number.isFinite(price), `$${price}`);
  t("랜딩 표시가와 일치", landing.includes(`$${price}`), `랜딩=$${price}`);
  t("가격이 실측 원가보다 높다 (팔수록 손해가 아니어야 한다)",
    price > MEASURED_COST_PER_CALL,
    `$${price} vs 원가 $${MEASURED_COST_PER_CALL} — ${(price / MEASURED_COST_PER_CALL).toFixed(2)}배`);
  t("6 decimals 로 환산", src.includes("1_000_000"));
  void dict;

  // 데모 모드 (X402_PAY_TO 미설정) 로 띄운다
  // 툴 검증에는 쿼터가 방해되므로 넉넉히 준다.
  // 쿼터 자체는 아래에서 따로, 낮은 한도로 확인한다.
  const env = { ...process.env, X402_PAY_TO: "", HL_MODE: "paper", FREE_CALLS_PER_DAY: "500" };
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
    t("스킴·네트워크 명시", src.includes('scheme: "exact"') && src.includes("base-sepolia"));

    console.log("\n쿼터 — 무료 한도를 넘으면 402 로 결제를 요구하는가");
    // 낮은 한도로 별도 인스턴스를 띄워 소진까지 확인한다
    const P2 = PORT + 1;
    const srv2 = spawn("npx", ["next", "dev", "-p", String(P2)],
      { env: { ...process.env, X402_PAY_TO: "", HL_MODE: "paper", FREE_CALLS_PER_DAY: "2", HL_QUOTA_SUFFIX: String(Date.now()) },
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
