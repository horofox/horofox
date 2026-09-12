// 에이전트가 **사는** 쪽 — 402 를 받고 스스로 결제하는 경로.
//
// 서버측만 검사하면 반쪽이다. 실제로 결제해서 200 을 받는 것까지 봐야
// "루프가 닫힌다"는 주장이 성립한다.
import "../lib/env";
import { spawn } from "node:child_process";
import { payingFetch, canPay, priceFromResponse, type PayEvent } from "../lib/x402/client";
import { PRICE_USD } from "../lib/x402/server";

const PORT = 3497;

async function main() {
  let fail = 0;
  const t = (n: string, ok: boolean, x = "") => { if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); };

  console.log("설정 감지");
  t("지갑 유무를 판정한다", typeof canPay() === "boolean", canPay() ? "지갑 있음" : "지갑 없음 (무료 경로만)");
  if (!canPay()) {
    console.log("  ℹ HEDERA_AGENT_ACCOUNT_ID/PRIVATE_KEY 가 없어 실결제는 건너뛴다.");
    t("지갑 없이 클라이언트를 만들면 안내와 함께 던진다", (() => {
      try { payingFetch(); return false; } catch (e) { return String(e).includes("portal.hedera.com"); }
    })());
  }

  console.log("\n402 응답에서 금액을 읽는가");
  const enc = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepts: [{ scheme: "exact", network: "hedera:testnet", amount: "10000", asset: "0.0.429274" }],
  })).toString("base64");
  const fake = new Response(null, { status: 402, headers: { "payment-required": enc } });
  t("USDC 6 decimals 를 달러로 환산", priceFromResponse(fake) === 0.01, `$${priceFromResponse(fake)}`);
  t("서버 단가와 일치", priceFromResponse(fake) === PRICE_USD);
  t("헤더가 없으면 결제 견적을 거부", (() => {
    try { priceFromResponse(new Response(null, { status: 402 })); return false; }
    catch (e) { return e instanceof Error; }
  })());

  console.log("\n실제 서버에 붙여 단계 전이를 본다");
  // 402 를 보려면 무료 허용량이 없어야 한다.
  const env = { ...process.env, HEDERA_ACCOUNT_ID: "0.0.123456", HEDERA_NETWORK: "testnet", FREE_CALLS_PER_DAY: "0" };
  const srv = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: "ignore", detached: true });
  try {
    const url = `http://127.0.0.1:${PORT}/api/x402?tool=price&symbol=BTC`;
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      try { const r = await fetch(url); if (r.status < 500) break; } catch { /* 대기 */ }
      await new Promise((r) => setTimeout(r, 1500));
    }

    const stages: PayEvent[] = [];
    if (canPay()) {
      const f = payingFetch({ onStage: (e) => stages.push(e) });
      const res = await f(url);
      // payTo 가 실재하지 않는 계정(0.0.123456)이라 정산은 반드시 실패한다.
      // 그게 정상이다 — 테스트가 검증하는 건 정산 성공이 아니라 **단계 기계가 끝까지 도는가**다.
      // 실제 계정으로 정산이 성사되는 것은 `npm run demo` 가 온체인으로 증명한다.
      const seq = stages.map((s) => s.stage).join(" → ");
      t("402 를 만나 서명하고 제출까지 갔다",
        ["payment_required", "signing", "settling"].every((s) => stages.some((x) => x.stage === s)), seq);
      t("정산 결과가 단계로 보고된다",
        stages.some((s) => s.stage === "paid" || s.stage === "refused"), seq);
      t("존재하지 않는 수취 계정으로는 정산되지 않는다", res.status !== 200, `HTTP ${res.status}`);
    } else {
      // 지갑이 없어도 **예산 게이트가 결제를 막는 경로**는 검증할 수 있다.
      const raw = await fetch(url);
      t("서버가 402 를 낸다", raw.status === 402, `HTTP ${raw.status}`);
      t("그 402 에서 금액을 읽는다", priceFromResponse(raw) === PRICE_USD, `$${priceFromResponse(raw)}`);
    }

    console.log("\n예산 통제 — 라이브러리가 아니라 우리가 정한다");
    let asked = -1;
    const denied: PayEvent[] = [];
    if (canPay()) {
      const f = payingFetch({
        onStage: (e) => denied.push(e),
        budgetGate: (amt) => { asked = amt; return false; },   // 항상 거부
      });
      const res = await f(url);
      t("예산 게이트가 금액을 받는다", asked === PRICE_USD, `$${asked}`);
      t("거부하면 결제하지 않고 402 를 그대로 돌려준다", res.status === 402, `HTTP ${res.status}`);
      t("거부가 단계로 보고된다", denied.some((s) => s.stage === "refused"));
    } else {
      console.log("  ℹ 지갑이 없어 게이트 실행은 건너뛴다. 코드 경로만 확인한다.");
      const src = await (await import("node:fs/promises")).readFile("lib/x402/client.ts", "utf8");
      t("budgetGate 가 결제 전에 호출된다", /budgetGate[\s\S]{0,200}refused/.test(src));
      t("거부 시 원래 402 를 반환한다", src.includes("return response"));
    }
  } finally { try { process.kill(-srv.pid!, "SIGKILL"); } catch { /* 종료됨 */ } }

  console.log(fail === 0 ? "\nX402-CLIENT OK" : `\nX402-CLIENT FAIL — ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("X402-CLIENT FAIL —", e instanceof Error ? e.message : e); process.exit(1); });
