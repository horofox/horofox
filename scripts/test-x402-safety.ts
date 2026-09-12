import "../lib/env";
import { PrivateKey } from "@hiero-ledger/sdk";
import { payingFetch, priceFromResponse, type PayEvent } from "../lib/x402/client";

let failures = 0;

function check(name: string, condition: boolean): void {
  if (!condition) failures++;
  console.log(`  ${condition ? "✓" : "✗"} ${name}`);
}

function quotedResponse(overrides: Record<string, unknown> = {}): Response {
  const encoded = Buffer.from(JSON.stringify({
    x402Version: 2,
    resource: { url: "https://example.test/data", description: "", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.429274",
      amount: "10000",
      payTo: "0.0.123456",
      maxTimeoutSeconds: 300,
      extra: {},
      ...overrides,
    }],
  })).toString("base64");
  return new Response(null, { status: 402, headers: { "PAYMENT-REQUIRED": encoded } });
}

function rejectsQuote(overrides: Record<string, unknown>): boolean {
  try {
    priceFromResponse(quotedResponse(overrides), "testnet");
    return false;
  } catch (error) {
    return error instanceof Error;
  }
}

async function main(): Promise<void> {
  console.log("strict Hedera quote validation");
  check("accepts testnet USDC micro-units", priceFromResponse(quotedResponse(), "testnet") === 0.01);
  check("rejects wrong network", rejectsQuote({ network: "hedera:mainnet" }));
  check("rejects wrong scheme", rejectsQuote({ scheme: "upto" }));
  check("rejects non-USDC asset", rejectsQuote({ asset: "0.0.0" }));
  check("rejects zero amount", rejectsQuote({ amount: "0" }));
  check("rejects fractional micro-units", rejectsQuote({ amount: "1.5" }));

  console.log("\nbudget denial before signing");
  const priorAccount = process.env.HEDERA_AGENT_ACCOUNT_ID;
  const priorKey = process.env.HEDERA_AGENT_PRIVATE_KEY;
  const priorFetch = globalThis.fetch;
  process.env.HEDERA_AGENT_ACCOUNT_ID = "0.0.123456";
  process.env.HEDERA_AGENT_PRIVATE_KEY = PrivateKey.generateECDSA().toStringRaw();
  let requests = 0;
  const events: PayEvent[] = [];
  globalThis.fetch = async () => {
    requests++;
    return quotedResponse();
  };

  try {
    const response = await payingFetch({
      network: "testnet",
      budgetGate: () => false,
      onStage: (event) => events.push(event),
    })("https://example.test/data");
    check("returns the original 402", response.status === 402);
    check("performs one request only", requests === 1);
    check("never enters signing", !events.some(({ stage }) => stage === "signing"));
    check("reports refusal", events.at(-1)?.stage === "refused");
  } finally {
    globalThis.fetch = priorFetch;
    if (priorAccount === undefined) delete process.env.HEDERA_AGENT_ACCOUNT_ID;
    else process.env.HEDERA_AGENT_ACCOUNT_ID = priorAccount;
    if (priorKey === undefined) delete process.env.HEDERA_AGENT_PRIVATE_KEY;
    else process.env.HEDERA_AGENT_PRIVATE_KEY = priorKey;
  }

  console.log(failures === 0 ? "\nX402 SAFETY OK" : `\nX402 SAFETY FAIL — ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("X402 SAFETY FAIL —", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
