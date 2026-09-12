import { createServer } from "node:http";
import { once } from "node:events";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";

let failures = 0;

function check(name: string, condition: boolean): void {
  if (!condition) failures++;
  console.log(`  ${condition ? "✓" : "✗"} ${name}`);
}

async function main(): Promise<void> {
  let verifyCalls = 0;
  let settleCalls = 0;
  const facilitator = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/supported") {
      response.end(JSON.stringify({
        kinds: [{
          x402Version: 2,
          scheme: "exact",
          network: "hedera:testnet",
          extra: { feePayer: "0.0.999999" },
        }],
        extensions: [],
        signers: {},
      }));
      return;
    }
    if (request.url === "/verify") {
      verifyCalls++;
      response.end(JSON.stringify({ isValid: true, payer: "0.0.700001" }));
      return;
    }
    if (request.url === "/settle") {
      settleCalls++;
      response.end(JSON.stringify({
        success: true,
        payer: "0.0.700001",
        transaction: "0.0.700001@1234567890.000000001",
        network: "hedera:testnet",
        amount: "10000",
      }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  facilitator.listen(0, "127.0.0.1");
  await once(facilitator, "listening");
  const address = facilitator.address();
  if (!address || typeof address === "string") throw new Error("facilitator did not bind a TCP port");

  process.env.HEDERA_NETWORK = "testnet";
  process.env.HEDERA_ACCOUNT_ID = "0.0.123456";
  process.env.X402_TESTNET_FACILITATOR_URL = `http://127.0.0.1:${address.port}`;
  // 허용량이 남아 있으면 결제를 요구하지 않는 게 정상 동작이다. 그래서 결제 경로를 보려는
  // 호출자는 아래에서 직접 소진시킨다. 입력 검증 테스트는 별도 호출자라 허용량이 필요하다.
  process.env.FREE_CALLS_PER_DAY = "2";
  process.env.HL_QUOTA_SUFFIX = `x402-settlement-${process.pid}-${Date.now()}`;

  try {
    const { GET } = await import("../app/api/x402/route");
    const url = "http://localhost/api/x402?tool=portfolio";
    const caller = `x402-settlement-${process.pid}-${Date.now()}`;
    // 이 호출자의 무료 허용량을 먼저 다 쓴다. 남아 있으면 402 가 아니라 200 이 오는 게 맞다.
    for (let i = 0; i < 2; i++) {
      await GET(new Request(url, { headers: { "x-forwarded-for": caller } }));
    }
    const unpaid = await GET(new Request(url, { headers: { "x-forwarded-for": caller } }));
    const paymentRequiredHeader = unpaid.headers.get("payment-required");
    check("unpaid request receives protocol 402", unpaid.status === 402 && paymentRequiredHeader !== null);
    if (!paymentRequiredHeader) {
      throw new Error(`missing PAYMENT-REQUIRED header: HTTP ${unpaid.status} ${await unpaid.text()}`);
    }

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
    const accepted = paymentRequired.accepts[0];
    if (!accepted) throw new Error("missing payment requirement");
    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      resource: paymentRequired.resource,
      accepted,
      payload: { transaction: "fake-authorized-transaction" },
    };
    const paidHeaders = new Headers({ "payment-signature": encodePaymentSignatureHeader(paymentPayload) });
    paidHeaders.set("x-forwarded-for", caller);
    const paid = await GET(new Request(url, { headers: paidHeaders }));

    console.log("\nauthorization settlement");
    check("facilitator verifies once", verifyCalls === 1);
    check("facilitator settles after handler", settleCalls === 1);
    check("paid response succeeds", paid.status === 200);
    const paymentResponseHeader = paid.headers.get("payment-response");
    check("paid response carries PAYMENT-RESPONSE", paymentResponseHeader !== null);
    if (paymentResponseHeader) {
      const receipt = decodePaymentResponseHeader(paymentResponseHeader);
      check("receipt reports successful settlement", receipt.success && receipt.transaction.length > 0);
    }

    const failedHandler = await GET(new Request(
      "http://localhost/api/x402?tool=price",
      { headers: paidHeaders },
    ));
    check("handler failure returns 400 after verification", failedHandler.status === 400);
    check("handler failure does not settle authorization", settleCalls === 1);

    console.log("\nfake payment header quota safety");
    delete process.env.HEDERA_ACCOUNT_ID;
    const freshFake = await GET(new Request(url, {
      headers: { "payment-signature": "fake", "x-forwarded-for": `${caller}-fresh` },
    }));
    check("demo mode rejects a fake header even with quota remaining", freshFake.status === 402);
    const fake = await GET(new Request(url, {
      headers: { "payment-signature": "fake", "x-forwarded-for": caller },
    }));
    const fakeBody = await fake.json() as { error?: string };
    check("demo mode does not trust a payment-looking header", fake.status === 402);
    check("fake header cannot bypass exhausted quota", fakeBody.error === "free quota exhausted");

    console.log("\nbrief input bounds");
    const invalidLimit = await GET(new Request(
      "http://localhost/api/x402?tool=brief&symbol=NVDA&limit=0",
      { headers: { "x-forwarded-for": `${caller}-limit` } },
    ));
    const invalidFilter = await GET(new Request(
      "http://localhost/api/x402?tool=brief&symbol=NVDA&equitiesOnly=yes",
      { headers: { "x-forwarded-for": `${caller}-filter` } },
    ));
    check("brief rejects limit outside 1..10", invalidLimit.status === 400);
    check("brief rejects non-boolean equitiesOnly", invalidFilter.status === 400);
  } finally {
    facilitator.close();
    await once(facilitator, "close");
  }

  console.log(failures === 0 ? "\nX402 SETTLEMENT OK" : `\nX402 SETTLEMENT FAIL — ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("X402 SETTLEMENT FAIL —", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
