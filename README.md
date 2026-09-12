# horofox

**An open-source, self-hostable alternative to [Bankr](https://bankr.bot)** — an AI agent you talk to in plain language: price checks, swaps, perpetuals and token launches, from a web terminal, chat bots, CLI, or REST API. Unlike Bankr, it reaches Hyperliquid's HIP-3 markets, so "buy Nvidia" is a real tokenized equity perp rather than a meme coin named after one.

> ⚠️ Swaps and the launchpad are paper — they price against real markets but settle in a local ledger. Perps sign real Hyperliquid orders when `HL_MODE=live`. No custody, not financial advice.

## The edge: the agent pays its own bills out of trade flow

Bankr's flywheel is **mint a token → collect its swap fees → fund the agent's inference**. Two things are wrong with copying it:

1. **Most of that fee isn't theirs.** Their own terminal states the pool charges a **0.7% swap fee, 95% of which goes to the token's creator** — leaving roughly 1/19 for the platform. The launchpad is customer acquisition, not the revenue.
2. **It's tied to the meme-coin cycle.** Launch revenue is not a floor; it fell **~92% from peak** in the public monthly data.

We run the same loop on **trading** instead of **minting**:

```
you trade  →  a builder code rides on the order (0.1%)
           →  Hyperliquid pays that fee on-chain
           →  the fee converts into LLM credits
           →  the agent pays for its own inference
```

Why this is defensible:

- **The protocol pays it, not a middleman.** Builder codes are a Hyperliquid primitive, so it isn't the kind of fee a competitor can undercut to 0% as a growth tactic.
- **It is now the standard way to integrate.** Over two months, three venues shipped on builder codes: [VALR](https://blog.valr.com/blog/valr-launches-200-hyperliquid-perps-markets), Africa's largest crypto exchange by volume and *"the first time a centralized exchange has integrated Hyperliquid directly"*; [Oku](https://x.com/okutrade/status/2079919154149171308); and Coinbase's [Base app](https://x.com/baseapp/status/2090122188074491951). We are on the same rail an exchange chose.
- **No token to launch.** No contract, no audit, no unlock schedule, no cycle risk.
- **Bankr routes Hyperliquid trades and doesn't collect this.** Their own Hyperliquid reference — `skills/bankr/references/hyperliquid.md` in Bankr's public skills repo, 192 lines — mentions "builder" exactly once — in the phrase *"HIP-3 builder-deployed dexes"* — and never as a fee they take.

Where it lives in the code — three pieces that used to be unconnected:

| Piece | File | Job |
| --- | --- | --- |
| Fee attachment | `lib/hl/core.ts` | every order action carries `builder`; the field is non-optional |
| On-chain read | `lib/hl/revenue.ts` | reads cumulative builder rewards from Hyperliquid |
| Conversion | `lib/selffund.ts` | turns settled fees into LLM credits, **idempotently** |

Settlement is idempotent by ledger: `data/selffund.json` records the cumulative amount already converted, so calling it twice grants nothing the second time. Concurrent settlements (an operator double-clicking, or a cron overlapping a manual run) are serialized in-process, so two simultaneous calls grant one payout between them rather than two. Rounding is always down, nothing is granted when the filesystem is read-only, and a shrinking on-chain figure never claws credits back.

```bash
npx tsx scripts/test-selffund.ts        # 25 assertions, incl. double-spend and race attempts
npx tsx scripts/test-selffund.ts --api  # 15 assertions: endpoint + operator-only settlement
```

### Coverage, measured rather than claimed

`GET /api/v1/metrics` counts what we can actually place orders against, at request time:

```
311 assets = 177 crypto (main perp dex) + 134 HIP-3
             HIP-3 = 115 tokenized equities + 19 indices & commodities
             across 4 dexes: xyz, io, mkts, para
             sample: TSLA NVDA HOOD INTC PLTR COIN META AAPL — and ANTH on io
```

Reproduce with `npx tsx scripts/test-coverage.ts`. The test also fails if a constant total is reintroduced into the UI — the landing page previously composed `177 + hip3` client-side, and a hardcoded number is not evidence.

### Who else is doing this

Honest competitor analysis, including where rivals beat us on price and platform, lives in
[docs/competition.md](docs/competition.md).

### Public metrics never sum real and paper

`/metrics` publishes the numbers, but `live` and `paper` are separate objects that **share no field names**, and there is no combined total anywhere in the payload — you cannot add them by accident because the shape doesn't offer it. `scripts/test-public-metrics.ts` asserts exactly that, including that no exposed value equals a live+paper sum.

<!-- Demo GIF goes here. Record a 15–30s demo (terminal + dashboard) and put the
     upload URL on its own line above this comment:
     `npm run dev`, then screen-record /terminal and /dashboard. -->

## Features

- **Chat terminal** (`/terminal`) — natural language → tool calls (price, swap, perps, launchpad, portfolio)
- **Trader dashboard** (`/dashboard`) — balances, live-mark positions with one-click close, bonding-curve launchpad, trade journal
- **Channel bots** — Telegram + Discord bots that answer mentions (group-chat dealer)
- **Social bot** — Farcaster and X. Posts measured market observations a few times a day and answers mentions, so a reply becomes a public ad. See [Social bot](#social-bot).
- **REST API** (`/api/v1/*`) — call the tools directly, optional bearer auth
- **CLI** — `npm run cli -- price eth`
- **Hyperliquid perps (paper)** — real-time mid prices, positions with live PnL
- **Token launchpad (paper)** — bonding curve with 1% fee accrual (the "fees fund compute" flywheel)
- **LLM gateway** — OpenAI-compatible proxy with per-key credit metering
- **Hedera x402 v2 micropayments** — HTTP 402 paywall on Hedera testnet (exact scheme; facilitator is configurable) + autonomous agent payment client with budget gate
- **Self-funding engine** — Hyperliquid builder fees settled into LLM credits idempotently
- **Revenue engine** — swap fees + gateway metering vs. LLM cost → self-sustaining flywheel metric
- **Trade journal + webhooks** — every execution journaled and POSTed out
- **Skills** — drop a file in `skills/` to extend the agent

## ETHOnline 2026: paid market brief

The x402 flow is Hedera **testnet** only. `scripts/demo-loop.ts` makes one paid `brief` request
with a configured testnet wallet, then requires an x402 paid retry, a `PAYMENT-RESPONSE` receipt,
and a live Hyperliquid market brief. It does not execute a trade, create credits, or claim a
builder fee.

Run it only against a deployed server with paid mode enabled and its free allowance exhausted:
```bash
HEDERA_NETWORK=testnet \
HEDERA_AGENT_ACCOUNT_ID=0.0.x \
HEDERA_AGENT_PRIVATE_KEY=0x... \
DEMO_X402_URL=https://your-paid-service.example \
npx tsx scripts/demo-loop.ts
```

## Quick start

```bash
git clone https://github.com/horofox/horofox.git
cd horofox
npm install
cp .env.example .env.local   # set OPENAI_API_KEY (any OpenAI-compatible endpoint works, e.g. Z.ai GLM)
npm run dev -- -p 3000       # landing /, terminal /terminal, dashboard /dashboard
```

Also available:

```bash
npm run bot                  # Telegram bot (TELEGRAM_BOT_TOKEN)
npm run bot:discord          # Discord bot (DISCORD_BOT_TOKEN)
npm run cli -- portfolio     # CLI
npm run test:tools           # tool unit tests
npm run test:parity          # integration tests (live Hyperliquid + RPC)
npm run test:e2e             # full LLM agent E2E (needs API key)
docker build -t horofox .
```

## Architecture

```
interfaces:  web (landing/terminal/dashboard) · telegram · discord · CLI · REST
core:        LLM tool-calling brain (12 tools) · paper ledger · revenue engine
platform:    LLM gateway (metered) · x402 paywall · trade journal · webhooks · skills
```

The same agent core powers every interface. See [`openspec/`](openspec) for the spec-driven development history and [public/report.html](public/report.html) for the full build report.

## Configuration

All keys are optional except the LLM:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | any OpenAI-compatible endpoint (OpenAI, Z.ai GLM, …) |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | endpoint/model override |
| `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN` | channel bots |
| `EVM_PRIVATEKEY` | "my wallet" mode for on-chain balance checks |
| `HL_NETWORK` | Hyperliquid `mainnet` (default) or `testnet` |
| `AGENT_API_KEY` | require bearer auth on `/api/v1/*` |
| `GATEWAY_API_KEYS`, `GATEWAY_PRICE_*` | LLM gateway auth + metering rates |
| `HEDERA_ACCOUNT_ID` | enable x402 charging (unset = demo mode) |
| `HEDERA_AGENT_ACCOUNT_ID`, `HEDERA_AGENT_PRIVATE_KEY` | testnet wallet used by the paid-demo client |
| `DEMO_X402_URL`, `DEMO_SYMBOL` | deployed paid service and optional `brief` symbol for the demo |
| `SWAP_FEE_RATE` | platform swap fee (default 0.005) |
| `WEBHOOK_URL` | outbound trade notifications |

## Disclaimer

This is a demonstration of agent architecture, not an investment product. Trading involves substantial risk. You are responsible for complying with the regulations of your jurisdiction before enabling real-money features.

## License

[MIT](LICENSE)

## Hackathon provenance (ETHOnline 2026 — Continuity track)

This project predates ETHOnline 2026 and is being extended during the event. [`HACKATHON.md`](HACKATHON.md)
discloses exactly what existed before (everything up to commit `586cbca`, 2026-09-02) and what is being
built during the event:

```bash
git log --oneline 586cbca        # pre-existing work
git log --oneline 586cbca..HEAD  # built during ETHOnline 2026
```

## Social bot

Telegram and Discord are pull channels — someone has to find you and join. Farcaster and X are push
channels: every reply is public. That is the difference between having a product and having users.

```bash
npm run bot:social -- --channel all --once          # dry run: prints what it would post
SOCIAL_DRY_RUN=0 npm run bot:social -- --live       # actually posts
```

Dry run is the default and `--live` alone is not enough — you must also set `SOCIAL_DRY_RUN=0`.
Publishing cannot be undone, so turning it on is a deliberate two-key action.

**Everything it posts is measured.** `lib/insights.ts` reads funding rates and 24h moves straight from
Hyperliquid HIP-3, and `bot/social/templates.ts` may only interpolate fields off that object — a template
cannot invent a number. Posts also pass a banned-phrase check (`guaranteed`, `risk-free`, `100x`, …),
because nobody reviews them before they go out.

### Cost, and the cap that enforces it

| Channel | Read a mention | Post | Post with a link |
| --- | --- | --- | --- |
| Farcaster (Neynar) | free tier | free tier | free tier |
| X | $0.005 | $0.015 | $0.20 |

X moved to pay-per-use in February 2026 and has no free tier. A link makes a post **13× more expensive**,
which is why `link` is a separate argument rather than something you concatenate into the text — the cost
is known before the call is made.

`lib/social/budget.ts` keeps a ledger in `data/social-budget.json` and refuses to spend past
`SOCIAL_MONTHLY_USD_CAP` (default **$5**). Concurrent sends are serialized, so two replies cannot both
read the same balance and slip past the cap. If the filesystem is read-only, paid actions are refused
rather than performed unrecorded.

```bash
npx tsx scripts/test-social-budget.ts   # cap, race, read-only refusal
npx tsx scripts/test-social.ts          # dry-run default, no invented numbers, no promises
npx tsx scripts/test-insights.ts        # every posted figure is measured
```
