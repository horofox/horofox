# Product-surface evidence

| Criterion | Scenario and invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| `brief` is discoverable | `npx tsx scripts/test-discovery.ts` | Exit 0; manifest, llms.txt, OpenAPI, and MCP each expose five catalog tools including `brief` and its `limit`/`equitiesOnly` parameters | `discovery-final-verified.log` |
| Demo rejects missing payment configuration | `HEDERA_AGENT_ACCOUNT_ID= HEDERA_AGENT_PRIVATE_KEY= HEDERA_NETWORK=testnet npx tsx scripts/demo-loop.ts` and a nonempty placeholder wallet with `DEMO_X402_URL=` | The script exits 1 when wallet values are absent and when the paid service URL is absent; wrappers treat those expected rejections as success | `demo-wallet-gate-final-verified.log`, `demo-service-config-gate-final-verified.log` |
| Submission/demo wording is testnet and receipt-gated | shell audit of `README.md`, `SUBMISSION.md`, `HACKATHON.md`, and `scripts/demo-loop.ts` | Blocky402 is not presented as verified; submission requires a receipt; demo gates wallet, paid stage, and receipt | `facilitator-honesty-final-serial.log`, `demo-wallet-gate-final-verified.log` |
| Changed TypeScript typechecks | `npx tsc --noEmit` | Exit 0 | `typecheck-final-verified.log` |
| Diff has no whitespace errors | `git diff --check` | Exit 0 | `diff-check-final-verified.log` |
| HIP-3 default brief | isolated demo-mode `GET /api/x402?tool=brief&symbol=NVDA` with a local test quota identity | HTTP 200 with all brief fields from Hyperliquid | `brief-nvda-final-verified.log`, `brief-nvda-final-response.json` |
| Stop-hook revalidation | serial discovery, typecheck, diff, configuration-gate, brief-smoke, and source-claim checks | All local product checks pass; paid settlement is explicitly unverified without a receipt | `stop-hook-verification-2.log` |

No successful paid-demo artifact is recorded here because it requires a deployed paid service, exhausted free allowance, and a real Hedera testnet wallet. The demo intentionally exits nonzero until those external preconditions and a `PAYMENT-RESPONSE` receipt are present.
