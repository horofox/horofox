# Agent Terminal — 채팅으로 엔비디아를 온체인에서 산다

Hyperliquid HIP-3 시장에는 토큰화된 주식·지수·원자재가 올라와 있다.
이 에이전트는 그 **311종에 도달**하고(코어 177 + HIP-3 134), **진짜 주문에 서명**한다.

채팅·텔레그램·디스코드·CLI·REST 어디서든 거래하고,
모든 주문에 builder code 가 붙어 **거래액의 0.1%** 가 수수료로 쌓인다.

## ⚠️ 수익을 약속하지 않는다

펀딩이 높은 시장을 잡는 캐리 전략을 70일치로 직접 백테스트했더니 **마이너스**였다.

| | 결과 |
|---|---|
| 무헤지 (47시장·140거래) | 펀딩−수수료 +0.20%/주, 가격변동 −5.85%(σ28.8%) → **−5.65%**, 승률 45% |
| 델타 중립 (16페어·930관측) | 펀딩 스프레드 +0.04%/주 < 수수료, 가격잔차 σ9.73% → **−0.60%**, 승률 32% |

HIP-3 는 배포자마다 오라클이 달라 **같은 자산이라도 두 시장의 가격이 함께 움직이지 않는다.**
그래서 이건 **거래 도구지 전략이 아니다.** 무엇을 살지는 사용자가 정한다.

Bankr(bankr.bot) 구조를 참고해 껍데기를 만들고, 거래 엔진은 Hyperliquid 네이티브로 독자 구현했다.

## 🌐 라이브 데모

**https://agent-terminal.xpost.workers.dev**

Cloudflare Workers 에 배포돼 있고, **읽기 전용**이다:

| 되는 것 | 안 되는 것 |
|---|---|
| 시세 조회 (코어 + HIP-3 311종) | 거래 — 배포본은 PAPER 모드 고정 |
| `/api/v1/mode`, `/api/v1/revenue` | 페이퍼 원장 저장 (Workers 는 파일시스템이 읽기 전용) |
| 랜딩·대시보드·터미널 UI | 유저 지갑 생성 |

쓰기가 필요한 동작은 `ReadOnlyStorageError` 로 **명시적으로 실패**한다 — 저장된 척하지 않는다.
실제 운용은 아래 셀프호스트로 해야 한다.

```bash
# 배포 (Cloudflare, wrangler 인증 필요)
npx opennextjs-cloudflare build && npx wrangler deploy

# 셀프호스트 (거래하려면 이쪽)
docker build -t agent-terminal . && docker run -p 3000:3000 --env-file .env.local agent-terminal
```

## 🌏 다국어 (한국어 / English)

의존성 없이 사전 하나로 돌린다. `lib/i18n.ts` 에 키를 추가하고 두 언어를 채우면 끝이다.

- 첫 방문은 브라우저 언어를 따르고(`ko-*` 면 한국어), 이후 선택은 `localStorage` 에 남는다
- `scripts/test-i18n.ts` 가 **누락·빈 번역·한/영 복붙**을 잡고,
  `--coverage` 는 UI 파일에 한국어 하드코딩이 남았는지 검사한다
- next-intl 을 쓰지 않은 이유: 라우팅이 `/ko` `/en` 으로 갈라지고 미들웨어가 붙는다. "더 심플하게"에서 멀어진다

## 💳 사용량 한도 = 구독 (x402)

Bankr 는 무료 하루 5메시지 → 월 $20 구독으로 푼다. 같은 구조를 **x402(USDC)** 로 옮겼다.
카드사도 계정도 필요 없고, 부르는 쪽이 에이전트여도 스스로 낸다.

| | 값 | 환경변수 |
|---|---|---|
| 무료 | 하루 20회 | `FREE_CALLS_PER_DAY` |
| 결제 1회 | +100회 | `CALLS_PER_PAYMENT` |
| 호출 단가 | $0.01 | `PRICE_USDC` (코드 상수) · 실측 원가 $0.00379 의 약 2.6배 |

```bash
GET  /api/v1/quota    # 잔여 확인
POST /api/v1/quota    # X-PAYMENT 헤더로 결제 → 크레딧 충전
```

- 결제한 호출은 무료분을 깎지 않는다 (이중 과금 방지)
- **산 크레딧은 날짜가 바뀌어도 이월된다** — 무료분만 초기화
- 저장소가 읽기 전용이면 방문자를 막지 않고 `degraded: true` 로 표시한다.
  공개 데모에서 한도를 못 세는 건 우리 사정이지 방문자를 막을 이유가 아니다

## ⚡ x402 유료 API

에이전트가 HTTP 402 를 보고 USDC 로 스스로 결제한다. 툴 4종:

| 툴 | 반환 |
|---|---|
| `price` | 퍼프 중간가 (코어 + HIP-3) |
| `markets` | 거래 가능 시장 목록, `?dex=xyz` 로 필터 |
| `funding` | 펀딩률 + **누가 지불하는지** (`longs pay shorts`) |
| `portfolio` | 잔고 |

```bash
curl "$URL/api/x402?tool=funding&symbol=SKHX"
```

원래 CoinGecko 를 썼는데 배포 환경에서 403, 로컬에서 429 로 죽었다.
**유료 API 의 원천을 남의 무료 API 에 두면 남의 레이트리밋에 사업이 묶인다** — Hyperliquid 로 갈아탔다.
`lib/price.ts` 도 같은 이유로 HL 우선, CoinGecko 는 HL 에 없는 심볼(스테이블·밈코인)만 처리한다.

## 🤖 소셜 봇 (텔레그램 · 디스코드)

Bankr 가 2주에 96,000명을 모은 건 기능이 아니라 **소셜 안에 있었기 때문**이다.
같은 엔진이 텔레그램·디스코드에서 그대로 돈다.

```bash
npm run bot          # 텔레그램 (롱폴링)
npm run bot:discord  # 디스코드
```

토큰 발급:

| 채널 | 발급처 | 주의 |
|---|---|---|
| 텔레그램 | [@BotFather](https://t.me/BotFather) → `/newbot` | — |
| 디스코드 | [discord.com/developers](https://discord.com/developers) → Bot | **Message Content Intent** 를 켜야 메시지를 읽는다 |

토큰이 없으면 봇은 조용히 죽지 않고 **무엇이 없는지와 어디서 받는지**를 출력하고 종료한다.
`scripts/test-bots.ts` 가 그 동작을 검증한다.

## 🔒 보안 — 실제로 겪은 사고와 방어

### ⚠️ 빌드 시 시크릿이 번들에 박혔던 일

**Next 는 빌드 중 `.env.local` 을 읽어 `process.env.X` 참조를 번들에 인라인한다.**
그대로 배포했더니 LLM API 키가 Worker 코드 안에 평문으로 실려 나갔다.
브라우저로 노출되진 않았지만(서버 사이드 번들), 열려 있던 `/api/chat` 을 통해
**누구나 그 키의 크레딧을 태울 수 있는 상태**였다.

같은 경로로 `data/` 전체 — `users.json`(유저 지갑 암호문) 포함 — 도 번들에 들어갔다.

**방어 (3중)**

1. `scripts/deploy-cf.sh` 가 빌드 동안 `.env.local` 을 치운다 (`trap` 으로 복구)
2. 빌드 후 `.open-next` 에서 `data/`·`.env*` 를 삭제하고, 시크릿이 남아 있으면 **배포를 중단**한다
3. `scripts/test-nosecrets.ts` 가 번들 전 파일을 훑어 실제 `.env.local` 값이 있는지 검사한다

```bash
./scripts/deploy-cf.sh          # 이걸로만 배포할 것
npx tsx scripts/test-nosecrets.ts   # 번들 청결 검사
npx tsx scripts/test-posture.ts     # 배포본 보안 상태 점검
```

**절대 `npx opennextjs-cloudflare build && npx wrangler deploy` 를 직접 쓰지 말 것.** 방어가 통째로 빠진다.

### 운영 시크릿 주입 — 빌드가 아니라 런타임에

키는 **Cloudflare 쪽에 암호화 저장**되고 번들에도 레포에도 남지 않는다.

```bash
printf '%s' "$KEY" | npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AGENT_API_KEY        # API 를 잠그려면
npx wrangler secret put USER_ENCRYPTION_KEY  # 멀티유저를 쓰려면
```

비밀이 **아닌** 설정(base URL·모델명·모드)은 `wrangler.jsonc` 의 `vars` 에 둔다.
시크릿과 설정을 섞지 않는 게 사고를 줄인다.

### 공개 데모의 채팅 남용 방어

데모는 LLM 키가 붙은 채로 열려 있다. 무제한이면 누구든 크레딧을 태울 수 있으므로
한 번의 호출 비용을 코드로 묶었다 (`app/api/chat/route.ts`).

| 상한 | 값 | 초과 시 |
|---|---|---|
| 대화 턴 | 20 | 413 |
| 요청 문자 수 | 8,000 | 413 |
| 응답 토큰 | 800 | 잘림 |
| 툴 호출 반복 | 5 | 중단 |

크레딧이 계속 빠지면 `AGENT_API_KEY` 를 넣어 API 전체를 잠그면 된다.

### LLM 은 z.ai(GLM) 를 쓴다

변수명이 `OPENAI_*` 인 건 SDK 가 OpenAI 호환 규약을 따르기 때문이고, 실제 제공자는 z.ai 다.

```bash
OPENAI_API_KEY=<z.ai 키>
OPENAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
OPENAI_MODEL=glm-5.3-flash
```

### 배포본이 자기 상태를 밝힌다

`GET /api/v1/mode` 가 `warnings`·`storage`·`llm` 을 함께 반환한다.
인증 없이 열려 있으면 스스로 경고한다 — 숨기면 운영자가 모르고 지나간다.

## 🔐 인증

API 는 `lib/auth.ts` 가 신원을 판정한다. **클라이언트가 보낸 `X-User-Id` 같은 헤더는 읽지 않는다** —
그렇게 하면 헤더 하나로 남의 계정이 될 수 있다. 신원은 서버가 아는 비밀에서만 나온다.

```bash
AGENT_API_KEY=운영자키                       # 없으면 로컬 개발로 간주해 개방
USER_API_KEYS=alice:키1,bob:키2              # 키 → userId 매핑은 서버가 갖는다
```

- 유저 키로 호출하면 그 유저 컨텍스트로 거래된다 (`{ userId }`)
- 운영자 키는 기존 동작(운영자 지갑)
- 토큰이 없거나 틀리면 401

**운영 배포 시 `AGENT_API_KEY` 를 반드시 설정할 것.** 미설정이면 API 가 인증 없이 열린다.

## 🔑 두 가지 모드

| | PAPER (기본) | LIVE |
|---|---|---|
| 주문 | 나가지 않음. 로컬 원장에 기록 | **실제 Hyperliquid 주문** |
| 시세 | 실시간 (HL info API) | 실시간 |
| 수수료 | 없음 (가상) | **거래액의 0.1% 가 내 지갑으로** |
| 필요한 것 | 없음 | `HL_MODE=live` + `HL_TRADER_KEY` + `HL_BUILDER_ADDRESS` |

**기본은 항상 PAPER.** 셋 중 하나라도 없으면 자동으로 PAPER 로 떨어진다 —
키가 있다는 이유만으로 실주문이 나가지 않게 구조로 막았다. 현재 모드는 `perpMode()` 로 확인한다.

### ⚠️ LIVE 전에 반드시: 빌더 계정에 100 USDC

Hyperliquid 는 **빌더에게 퍼프 계정 가치 100 USDC 이상**을 요구한다.
미달이면 builder code 가 붙은 주문이 **전부 거부된다** — 유저가 아예 거래를 못 한다.

### 🔴 수수료 단위 함정

같은 수수료가 두 곳에서 **단위가 다르다.** 섞으면 100배 틀린다.

| 위치 | 필드 | 단위 | 0.1% 의 값 |
|---|---|---|---|
| 주문 첨부 | `action.builder.f` | tenths-of-bps (정수) | **`100`** |
| 유저 승인 | `approveBuilderFee.maxFeeRate` | 퍼센트 문자열 | **`"0.1%"`** |

그래서 변환은 `lib/hl/units.ts` 밖에서 하지 않는다.

## 📈 거래 가능 자산

메인 perp dex(BTC·ETH·SOL·HYPE 등 177종)에 더해 **HIP-3 dex 4곳(`xyz`·`io`·`mkts`·`para`) 134종**까지 도달한다. 한동안 `xyz` 하나만 읽었는데, 실측해보니 살아 있는 dex 가 넷이었다 — `io` 는 하루 $67M 이 오가고 거기에 **ANTH(Anthropic) 프리IPO 마켓**이 있다:

- **SKHX** SK하이닉스 · **SKHY** SK하이닉스 ADR · **SMSN** 삼성전자
- **DRAM** D램 가격 지수 (개별주 프록시가 아니라 메모리 사이클 그 자체)
- **MU** 마이크론 · **SNDK** 샌디스크 · **EWY** 한국 MSCI ETF
- SP500 · XYZ100(나스닥100) · GOLD · SILVER · BRENTOIL · NVDA · TSLA …

HIP-3 자산은 주문 ID 체계가 다르다: `assetId = 100000 + perpDexIndex × 10000 + indexInMeta`.
이걸 틀리면 **다른 종목에 주문이 나가므로** `scripts/test-hl-engine.ts` 가 공식을 못박아 검증한다.

## Bankr 부품별 클론 현황

| # | Bankr의 부품 | 우리 구현 | 상태 |
|---|---|---|---|
| 1 | 웹 터미널 + 에이전트 브레인 | Next.js 채팅 UI + `lib/tools.ts` | ✅ 동작 (페이퍼) |
| 2 | 소셜 채널 — 텔레그램 | `bot/telegram.ts` 롱폴링 | ✅ 구현, 토큰 입력 대기 |
| 2b | 소셜 채널 — 디스코드 | `bot/discord.ts` | ✅ 스캐폴드, 토큰 입력 대기 |
| 2c | 트레이더 대시보드 (비채팅 UI) | `/dashboard` — REST API만으로 동작, 체결 저널 | ✅ 동작 |
| 3 | Agent REST API | `/api/v1/*` (가격·스왑·퍼펫·런치·잔액) | ✅ 동작 검증 |
| 4 | CLI | `npm run cli` (10개 커맨드) | ✅ 동작 검증 |
| 5 | 퍼펫 트레이딩 ← 독자(Hyperliquid) | `lib/perps.ts` + `lib/hl/*` — PAPER/LIVE 양쪽, HIP-3 포함 | ✅ 서명까지 검증 |
| 6 | 토큰 런치패드 | `lib/launchpad.ts` 본딩커브 + 1% 수수료 적립 | ✅ 수학 검증 |
| 7 | LLM 게이트웨이 | `/api/gateway/v1/chat/completions` + 사용량 적산 | ✅ 인증 검증 |
| 8 | x402 유료 API ← 독자 | `/api/x402` 402 페이월 + 데모 모드 | ✅ 스펙 준수 응답 |
| 9 | 스킬 시스템 | `skills/*.ts` + 레지스트리 병합 (gas 예시) | ✅ |
| 10 | 온체인 지갑 | Base Sepolia 잔액 조회 (`EVM_PRIVATEKEY` 시 내 지갑 모드) | ✅ RPC 검증 |
| 11 | 실제 주문 서명 + builder fee | `lib/hl/trade.ts` — 서명·전송 경로 완성 | ✅ 서명 검증 / ⬜ 전송은 자금 필요 |
| 12 | 런치패드 온체인화 / 수수료→컴퓨팅비 전환 | 컨트랙트 | ⬜ 법률 검토 후 |
| 13 | X·파캐스터 채널, 웹훅, 스킬 마켓 UI | — | ⬜ 백로그 |

독자 컨셉: **"채팅으로 Hyperliquid 퍼펫을 치고, x402로 자기 API 비용을 스스로 내는 에이전트"**

## 실행

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY 필수 + 채널 토큰 등 선택
npm run dev -- -p 3002       # 웹 (랜딩 /, 터미널 /terminal, 대시보드 /dashboard)
npm run bot                  # 텔레그램 봇
npm run bot:discord          # 디스코드 봇
npm run cli                  # CLI (price/swap/perp/launch/…)
npm run test:tools           # 기존 툴 테스트
npm run test:parity          # 패리티 통합 테스트 (HL 실시세 포함)
```

### Hyperliquid 엔진 검증

```bash
npx tsx scripts/test-hl-engine.ts   # 단위변환·라운딩·HIP-3 ID (네트워크 불필요)
npx tsx scripts/test-hl-live.ts     # HIP-3 실도달 (SKHX·SMSN·DRAM …)
npx tsx scripts/test-builder.ts     # builder code 가 모든 주문에 붙는가
npx tsx scripts/test-mode.ts        # PAPER/LIVE 분리 — 실수 방지
npx tsx scripts/test-sign.ts        # 실제 EIP-712 서명 생성·검증
npx tsx scripts/test-safety.ts      # 레버리지·최소액·출금경로 부재
npx tsx scripts/test-revenue.ts     # 온체인 builder 수수료 조회
npx tsx scripts/test-rest.ts        # 서버 띄워 REST 실호출
```

## 검증된 것 (2026-08-30)

- Hyperliquid BTC/ETH 실시간 mid 조회 → 페이퍼 롱 진입(mark 평가)→ 청산 정산 일치
- 런치패드: 발행(0.0001) → 매수 시 가격 상승 → 전량 매도 → 1% 수수료 적립 확인
- REST: `/api/v1/price` 2479.28, `/api/v1/swap` 체결, x402 데모/에러처리, gateway 401
- 온체인: Base Sepolia 주소 잔액 조회, `next build` 타입 통과

### 멀티유저용 환경변수

```bash
USER_ENCRYPTION_KEY=$(openssl rand -hex 32)   # 유저 agent 키 암호화 (없으면 저장 거부)
HL_TESTNET_KEY=                                # 테스트넷 트레이더 키 (테스트 전용)
```

## 아직 안 된 것 (정직하게)

- **체결(fill) 은 아직 없다.** 테스트넷에서 주문을 실제로 전송했고 거래소가 우리 서명을 검증해
  서명자를 복원하는 것까지 확인했지만(`testnet-trade.ts --probe`), 계정에 테스트넷 USDC 가 없어
  체결까지는 가지 못했다. faucet 이 지갑 연결 UI 를 요구해 자동화할 수 없다 — **사람이 한 번 눌러야 한다.**
- **멀티유저 인증은 없다.** 유저별 지갑·암호화 저장·컨텍스트 분리는 됐지만,
  `userId` 를 누가 넘기는지 검증하는 건 호출자 몫이다. 외부 공개 전 반드시 인증을 붙일 것.
- **LIVE 청산 시 마진 환원이 원장에 반영되지 않는다.** 실계좌에서는 HL 계정이
  source of truth 라 로컬 원장을 쓰지 않는다 (`returnedUsdc: 0`). 페이퍼 모드는 그대로 정산한다.
- **런치패드·스왑은 여전히 페이퍼다.** 이번 머지는 퍼펫 거래 경로만 실거래로 바꿨다.
- **수익 항목을 합산하지 않는다.** `revenueSummary()` 의 `totalRevenueUsdc` 는 페이퍼 집계이고,
  실매출은 `real.builderFeesUsdc` 에 따로 있다. 섞으면 매출을 착각한다.


## 🧪 테스트넷에서 첫 실주문

메인넷에 돈을 걸기 전에 여기서 왕복을 닫는다.

```bash
npx tsx scripts/testnet-trade.ts          # 진단만 — 무엇이 없는지 알려준다
npx tsx scripts/testnet-trade.ts --probe  # 자금 없이 전송해 서명이 통과하는지 확인
npx tsx scripts/testnet-trade.ts --send   # 자금이 있으면 실제 주문
```

**`--probe` 가 하는 일**: 자금이 없어도 실제로 주문을 보낸다. 거래소가
`User or API Wallet 0x… does not exist` 로 거부하면서 **우리 서명에서 서명자 주소를 복원**하는데,
그 주소가 우리 계정과 일치하면 서명·전송 경로가 정상이라는 증거다.
즉 **남은 건 코드가 아니라 자금**임을 가른다.

자금 채우는 법:
1. `HL_TESTNET_KEY` 를 `.env.local` 에 저장 (스크립트가 없으면 생성해 알려준다 — 테스트넷 전용 키)
2. https://app.hyperliquid-testnet.xyz/drip 에서 지갑 연결 후 테스트넷 USDC 수령
3. **빌더 주소의 퍼프 계정에도 $100 이상** 입금 (없으면 모든 주문이 거부된다)
4. `--send` 로 재실행

## 👥 멀티유저

유저마다 별도의 Hyperliquid **agent 지갑**을 만들어 각자의 주문을 각자의 키로 서명한다.
수수료는 전부 하나의 builder 주소(운영자)로 모인다.

```ts
import { ensureAgentWallet, upsertUser } from "@/lib/users";
import { openPerp } from "@/lib/perps";

const u = await ensureAgentWallet("telegram:12345");   // agent 지갑 생성 (키는 암호화 저장)
// → 유저에게 u.agentAddress 를 HL 앱에서 승인하게 안내
await upsertUser("telegram:12345", { mainAddress: "0x…", agentApproved: true });

await openPerp("SKHX", "long", 100, 5, { userId: "telegram:12345" });  // 그 유저로 주문
await openPerp("BTC", "long", 100, 5);                                  // ctx 생략 = 운영자
```

- **agent 지갑은 주문만 가능하고 출금 권한이 구조적으로 없다.** 서버가 털려도 자금은 못 나간다.
- 개인키는 `USER_ENCRYPTION_KEY` 로 **AES-256-GCM 암호화**해서만 저장한다.
  키가 없으면 저장 자체를 거부한다 (평문 경로 없음).
- 포지션 조회는 유저의 **메인 지갑** 기준이다. agent 는 서명만 한다.
- 승인 전 유저는 거래가 거부된다.

**한계**: 인증은 호출자 책임이다. `userId` 를 넘기면 그 유저로 거래되므로,
REST 를 외부에 열 때는 `AGENT_API_KEY` 와 함께 **유저 식별을 반드시 서버가 검증**해야 한다.

## 📊 대시보드

`/dashboard` 상단에 거래 모드 배지가 뜬다.

- **● LIVE** — 실주문이 나가는 상태. 네트워크(mainnet/testnet)와 builder·trader 주소를 함께 표시
- **○ PAPER** — 실주문 없음. **왜** 페이퍼인지 이유까지 보여준다 (키 없음/모드 미지정 등)
- 그 아래 **온체인 builder 수수료**(실수익)를 페이퍼 집계와 **분리해서** 표시한다.
  페이퍼 항목은 "페이퍼 합계"로 이름을 바꿔 실매출과 혼동하지 않게 했다.

```bash
curl localhost:3002/api/v1/mode      # 모드·이유·주소 (개인키는 절대 안 나온다)
curl localhost:3002/api/v1/revenue   # real.builderFeesUsdc = 실수익
```

## 규제 메모 (법률 자문 대체 아님)

- 커스터디얼(플랫폼 보관) 구조는 관할별 라이선스 영역 → **비커스토디얼 퍼스트**
- 퍼펫·토큰 발행은 테스트넷/페이퍼로 먼저, 실서비스 전 해당 관할 규제 전문가 검토
- **거래 수수료를 받으면서 특정 관할의 개인투자자를 유치하면** 그 나라의 무인가
  금융투자업에 해당할 수 있다. 대상 이용자를 정하기 전에 금융규제 전문가와 확인할 것.
- **HIP-3 자산은 오라클 리스크가 실재한다.** 2026-07-28 한국 NXT 의 이상 체결 1건이
  SKHX 퍼프를 약 19% 급락시켜 960여 계좌 $5,740만이 청산됐다. 배포자가 오라클 입력을
  통제하며, HIP-3 슬래싱은 배포자 스테이크를 소각할 뿐 피해자에게 보상하지 않는다.
