# ETHOnline 2026 Submission Copy

Use this document to copy and paste directly into the ETHGlobal submission portal fields.

---

### Project Name
`Horofox`

### Tagline / Short Description
`A Hedera testnet x402 client that pays for a live Hyperliquid market brief.`

---

### Description (Problem & Solution)

Horofox exposes Hyperliquid market data behind an HTTP 402 paywall and includes a client that pays
for one market brief. The intended demo is explicitly on **Hedera testnet**: a configured testnet
wallet requests `brief`, receives the x402 payment requirement, signs and retries, then the script
accepts success only when it receives HTTP 200, a `PAYMENT-RESPONSE` settlement receipt, and a
schema-valid Hyperliquid response.

The brief returns price, funding, payment direction, leverage, dex, timestamp, source, and an
explicit reminder that the instrument is a perpetual future rather than a share. This submission
does not claim a mainnet payment, a live Hyperliquid trade, builder-fee income, or credit conversion.

---

### How it's Made (Technical Architecture & Implementation)

Built with Next.js and TypeScript:

1. **Hyperliquid market-data layer (`lib/hl/`)** reads asset metadata and mids across core and configured HIP-3 dexes.
2. **Hedera x402 server (`lib/x402/server.ts`, `app/api/x402/route.ts`)** configures the exact scheme for `hedera:testnet` when a recipient account is set.
3. **Payment client (`lib/x402/client.ts`)** wraps fetch, signs testnet payment retries, and reports payment stages.
4. **Market brief (`tool=brief`)** combines an asset's price, funding context, dex, max leverage, timestamp, and perpetual caveat in one response.
5. **Discovery (`lib/x402/catalog.ts`)** derives the manifest, `llms.txt`, OpenAPI, and MCP tool descriptions from one catalog.

---

### Partner Bounties Applied

#### 1. Hedera — AI & Agentic Payments on Hedera ($6,000)
- **Testnet integration**:
  - The server and client are configured for the Hedera exact scheme on testnet.
  - `scripts/demo-loop.ts` refuses to report success without configured wallet credentials, a paid retry, a settlement receipt, and a valid paid `brief` response.
  - Attach the command output containing the actual receipt to the final submission; until then, this document makes no claim of a completed payment.

#### 2. Bazantic — Agentify a new API ($1,000)
- **Integration**:
  - Full API discoverability surface implemented according to standard machine-readable formats.
  - Generates unified documentation and tool schemas across `/.well-known/x402`, `/llms.txt`, `/openapi.json`, and Model Context Protocol (MCP).
  - Every catalogued tool includes price and network metadata; `brief` also includes the perpetual-future caveat in its result.

---

### Links for Submission
- **GitHub Repository**: `https://github.com/horofox/horofox`
- **Demo Script**: `scripts/demo-loop.ts` (Hedera testnet; attach a successful run output)
- **Continuity / Prior Work Disclosure**: `HACKATHON.md`
