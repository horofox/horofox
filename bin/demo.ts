#!/usr/bin/env node
// 데모 — 루프 하나를 끝까지 보여준다.
//
//   못 낸다 → 번다 → 크레딧이 된다 → 그 돈으로 데이터를 산다 → 답한다
//
// 이 스크립트는 영상 녹화용이다. 그래서 두 가지를 지킨다:
//   1. 각 단계가 **상태 전이**로 보여야 한다. 말로 설명하지 않는다.
//   2. 실제로 일어난 것과 시뮬레이션한 것을 **화면에서 구분**한다.
//      데모에서 가짜를 진짜처럼 보이게 하는 건 심사에서 가장 크게 깎이는 짓이다.
//
// 실행: npm run demo            (로컬 dev 서버 대상)
//       DEMO_TARGET=https://horofox.com npm run demo

import "../lib/env";
import { peek, consume, grantCredits } from "../lib/quota";
import { peekSelfFund, settleSelfFund, USD_PER_CALL, CONVERT_RATIO, volumeNeededForCalls } from "../lib/selffund";
import { builderRevenue, type BuilderRevenue } from "../lib/hl/revenue";
import { payingFetch, canPay, agentAccountId, priceFromResponse } from "../lib/x402/client";
import { PRICE_USD, NETWORK } from "../lib/x402/server";

const TARGET = process.env.DEMO_TARGET ?? "http://localhost:3000";
const SUBJECT = "demo:agent";
const ASK = "What is NVDA trading at?";

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 녹화용 호흡. DEMO_FAST=1 이면 즉시 넘어간다 (테스트·CI). */
const beat = () => (process.env.DEMO_FAST ? Promise.resolve() : sleep(900));

function act(n: number, title: string) {
  console.log(`\n${C.bold(`── ${n}. ${title}`)}\n`);
}

/** 실제로 일어난 일과 시뮬레이션을 화면에서 갈라놓는다. */
function tag(real: boolean) {
  return real ? C.green("[REAL]") : C.yellow("[SIMULATED]");
}

async function main() {
  console.log(C.bold("\nhorofox — an agent that cannot afford to answer you"));
  console.log(C.dim(`target ${TARGET} · network hedera:${NETWORK} · price $${PRICE_USD}/call\n`));

  // ── 1. 못 낸다
  act(1, "The agent is broke");
  let q = await peek(SUBJECT);
  console.log(`   user asks: ${C.cyan(`"${ASK}"`)}`);
  await beat();
  console.log(`   credits ${q.credits} · free left ${Math.max(0, q.freeLimit - q.used)} · ${C.red("refuses to answer")}`);
  console.log(C.dim(`   ${tag(true)} lib/quota.ts — no credit, no answer. This is not a mock.`));
  if (q.allowed) {
    console.log(C.dim(`   (run with FREE_CALLS_PER_DAY=0 to see the refusal — npm run demo does this)`));
  }
  await beat();

  // ── 2. 번다
  act(2, "So it goes and earns");
  let rev: BuilderRevenue;
  let revReal = true;
  try {
    rev = await builderRevenue();
  } catch (e) {
    rev = { builder: "", cumulativeUsd: 0, feePercent: 0.1, configured: false };
    console.log(C.dim(`   on-chain read failed: ${e instanceof Error ? e.message : String(e)}`));
  }

  if (rev.configured && rev.cumulativeUsd > 0) {
    console.log(`   ${tag(true)} builder ${rev.builder}`);
    console.log(`   on-chain builder fees: ${C.green(`$${rev.cumulativeUsd.toFixed(6)}`)} at ${rev.feePercent}% of flow`);
  } else {
    revReal = false;
    console.log(`   ${tag(false)} builder code not registered — Hyperliquid requires a 100 USDC`);
    console.log(`   deposit in the perps account before it will pay builder fees. Not made.`);
    console.log(C.dim(`   The code path below is the real one; only the fee figure is injected.`));
  }
  await beat();

  // 수수료 조회기는 주입 가능하다 (lib/selffund.ts: RevenueReader).
  // 등록 전이라 실측이 0 이므로, 여기서만 시뮬레이션 값을 흘려넣는다.
  const SIM_FEE_USD = 0.42;
  const reader = revReal
    ? builderRevenue
    : async (): Promise<BuilderRevenue> => ({ ...rev, cumulativeUsd: SIM_FEE_USD, configured: true });

  if (!revReal) {
    console.log(`   injecting ${C.yellow(`$${SIM_FEE_USD}`)} of fees — ${C.dim(`the flow that produces it: $${volumeNeededForCalls(210).toLocaleString()} of volume at 0.1%`)}`);
    await beat();
  }

  // ── 3. 수수료가 크레딧이 된다
  act(3, "The fee becomes inference credit");
  const before = await peekSelfFund(reader);
  console.log(`   pending $${before.pendingUsd.toFixed(6)} × ratio ${CONVERT_RATIO} ÷ $${USD_PER_CALL}/call`);
  await beat();
  const settled = await settleSelfFund(reader);
  console.log(`   granted ${C.green(`${settled.granted} calls`)} to ${settled.grantedCalls ? "the pool" : "the pool"}`);
  console.log(C.dim(`   ${tag(true)} lib/selffund.ts — real ledger write to data/selffund.json`));
  await beat();

  // 멱등성은 말이 아니라 두 번 눌러서 보인다.
  const again = await settleSelfFund(reader);
  console.log(`   settle again → ${C.green(`${again.granted} calls`)} ${C.dim("(idempotent: the ledger already counted it)")}`);
  await beat();

  // 데모 주체에게 크레딧을 옮겨준다 (풀 → 이 에이전트).
  if (settled.granted > 0) {
    q = await grantCredits(SUBJECT, Math.min(settled.granted, 50));
    console.log(`   agent credits: ${C.green(String(q.credits))}`);
  }
  await beat();

  // ── 4. 그 돈으로 데이터를 산다
  act(4, "It spends what it earned — x402 on Hedera");
  const url = `${TARGET}/api/x402?tool=price&symbol=NVDA`;

  if (!canPay()) {
    console.log(`   ${tag(false)} no payment wallet configured.`);
    console.log(C.dim(`   set HEDERA_AGENT_ACCOUNT_ID / HEDERA_AGENT_PRIVATE_KEY to pay for real.`));
    const res = await fetch(url).catch((e) => e as Error);
    if (res instanceof Error) {
      console.log(C.red(`   request failed: ${res.message}`));
    } else if (res.status === 402) {
      console.log(`   server answers ${C.yellow("402 Payment Required")} — $${priceFromResponse(res)}`);
      console.log(C.dim(`   ${tag(true)} the 402 above is real; we just cannot sign it without a key.`));
    } else {
      console.log(`   server answers ${C.red(`${res.status}`)} — ${C.red("payment not enforced")}`);
      console.log(C.dim(`   HEDERA_ACCOUNT_ID is unset on this target, so it is running in demo mode.`));
    }
  } else {
    console.log(`   ${tag(true)} paying from ${agentAccountId()} on hedera:${NETWORK}`);
    const f = payingFetch({
      onStage: (e) => {
        const amt = e.amountUsd ? ` $${e.amountUsd}` : "";
        console.log(`   ${C.cyan(e.stage.padEnd(17))}${amt}${e.detail ? ` ${C.dim(e.detail)}` : ""}`);
      },
      // 예산은 결제 라이브러리가 아니라 우리 원장이 정한다.
      budgetGate: async (usd) => {
        const s = await peek(SUBJECT);
        const ok = s.credits > 0 || usd <= 0.05;
        if (!ok) console.log(C.red(`   budget refused $${usd}`));
        return ok;
      },
    });
    const res = await f(url);
    const body = await res.text();
    console.log(`   ${res.ok ? C.green("200") : C.red(String(res.status))} ${C.dim(body.slice(0, 160))}`);
  }
  await beat();

  // ── 5. 답한다
  act(5, "Now it can answer");
  const final = await consume(SUBJECT);
  if (final.allowed) {
    console.log(`   ${C.cyan(`"${ASK}"`)}`);
    console.log(`   ${C.green("answered")} — credits ${final.credits} remaining`);
  } else {
    console.log(`   ${C.red("still cannot answer")} — credits 0`);
  }

  console.log(`\n${C.dim("earning and spending on the same rail, in one system.")}\n`);
}

main().catch((e) => {
  console.error(C.red(`\ndemo failed: ${e instanceof Error ? e.stack ?? e.message : e}\n`));
  process.exit(1);
});
