# ETHOnline 2026 Submission Copy

Use this document to copy and paste directly into the ETHGlobal submission portal fields.

---

### Project Name
`Horofox`

### Tagline / Short Description
`An AI agent that cannot afford to answer you — until it earns the fee itself.`

---

### Description (Problem & Solution)

Existing agentic payment projects (e.g. Lisbon and HackMoney finalists) exclusively address how agents spend pre-funded wallets. None solve where the capital originates. 

Horofox closes the autonomous economic loop:
1. **The Real Constraint**: The agent declines queries when its balance is $0, returning HTTP 402.
2. **Autonomous Earning**: Authorized to earn its own budget, the agent executes perp trades on Hyperliquid with a non-optional 0.1% builder code. User funds remain completely non-custodial via an agent wallet that structurally cannot withdraw funds.
3. **Idempotent Self-Funding**: On-chain builder fees accrued on Hyperliquid L1 are settled idempotently into LLM credits (`lib/selffund.ts`), completely preventing double-crediting.
4. **Autonomous Micropayments via Hedera x402**: With credits acquired, the agent consumes live external market data by issuing micro-payments over Hedera testnet using the HTTP 402 Exact Scheme and the Blocky402 facilitator.
5. **Verified Delivery**: The agent answers user inquiries using fresh, paid data and displays an auditable ledger separating real on-chain execution from paper accounting.

*"Software is no longer a moat — capital and economic agency are."*

---

### How it's Made (Technical Architecture & Implementation)

Built with Next.js and TypeScript, orchestrating a dual-chain architecture:

1. **Hyperliquid L1 Trading Layer (`lib/hl/`)**:
   - Executes non-custodial perpetual orders across core and HIP-3 dexes.
   - Strictly enforces Hyperliquid's price (5 significant digits) and szDecimals rounding rules.
   - Automatically attaches the builder fee (`0.1%`, represented as `f = 100` tenths-of-bps in signed orders vs `"0.1%"` in approval payloads) — tested against 100x unit misconfigurations.
   - Non-custodial security: Agent keys possess only order permissions; withdrawal is structurally impossible.

2. **Hedera x402 Resource Server (`lib/x402/server.ts`, `app/api/x402/route.ts`)**:
   - Upgraded to `@x402/core` v2 and `@x402/hedera`.
   - Connects to the official testnet facilitator (`x402.org/facilitator` / Blocky402) returning live `feePayer` co-signatures.
   - Serves real-time prices, 316+ markets, and funding rates for perpetuals and HIP-3 tokenized equities.

3. **Autonomous Agent Payment Client (`lib/x402/client.ts`)**:
   - Custom `@x402/fetch` wrapper with autonomous ECDSA signing on Hedera `TransferTransaction`.
   - Features a self-funded budget gate that halts spending before signing if credits are depleted.
   - Exposes discrete payment event stages (`requesting` → `payment_required` → `signing` → `settling` → `paid`) for auditable tracking.

4. **Self-Funding Ledger (`lib/selffund.ts`)**:
   - Converts Hyperliquid on-chain builder fees into inference calls.
   - Strict idempotency: records cumulative settled amounts so re-running conversions yields 0 delta.

5. **Discoverability Surface (`lib/x402/catalog.ts`)**:
   - Exposes a unified tool catalog across four discoverable surfaces: `/.well-known/x402` manifest, `/llms.txt`, `/openapi.json`, and an MCP Server (`bot/mcp.ts`).

---

### Partner Bounties Applied

#### 1. Hedera — AI & Agentic Payments on Hedera ($6,000)
- **Integration**:
  - Live x402 resource server hosted on Hedera Testnet using the exact settlement scheme.
  - Verified live facilitator response (`feePayer: 0.0.9185802` from `x402.org/facilitator`).
  - Implemented the agent-side payment client (`lib/x402/client.ts`) that intercepts HTTP 402, constructs Hedera ECDSA transfer signatures, and settles requests autonomously.
  - Verified end-to-end via automated test suite (`scripts/test-x402.ts` and `scripts/test-x402-client.ts`).

#### 2. Bazantic — Agentify a new API ($1,000)
- **Integration**:
  - Full API discoverability surface implemented according to standard machine-readable formats.
  - Generates unified documentation and tool schemas across `/.well-known/x402`, `/llms.txt`, `/openapi.json`, and Model Context Protocol (MCP).
  - Every tool explicitly includes transparent pricing ($0.01/query), network details (`hedera:testnet`), and disclosure notes on market mechanics.

---

### Links for Submission
- **GitHub Repository**: `https://github.com/horofox/horofox`
- **Demo Script**: `scripts/demo-loop.ts`
- **Continuity / Prior Work Disclosure**: `HACKATHON.md`
