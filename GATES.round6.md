# Gates: 소셜 네이티브 봇 (Farcaster + X)

Scope: 유저 0명을 벗어나기 위한 **유입 채널**을 만든다.
텔레그램·디스코드는 유저가 찾아와야 하는 pull 채널이다. X·Farcaster 는 답글이 곧 공개 광고인 push 채널이다.

## 조사에서 확정된 것

- `research/pages/leaderboard.txt:16` — "Posting about Bankr on X (Social)".
  Bankr 의 Leaderboard 는 허영 지표가 아니라 **X 게시를 점수화하는 유입 장치**다. 엔진은 $BNKR 보상이다.
- 우리는 토큰을 안 찍기로 했다. → 같은 장치를 못 쓴다.
  **봇 자체가 유입 장치가 되어야 한다.**

## 비용 (이번 라운드의 절반은 기능이 아니라 지출 상한이다)

| 채널 | 요금 |
|---|---|
| Farcaster (Neynar) | 무료 100K 크레딧 · 웹훅 1 · 답글 ~150 크레딧 |
| X | 2026-02 부터 무료 없음. 읽기 $0.005 · 게시 $0.015 · **링크 포함 $0.20** |

X 는 링크 하나가 게시 13건 값이다. 매출은 0 이다. 상한을 코드가 강제한다.

## 명시적 비범위

- **Radar 실시간 알림** — 유지용이지 유입용이 아니다. 유저가 생긴 뒤에.
- **Neynar 웹훅** — 공개 URL 필요. 폴링으로 시작한다.
- **Leaderboard·Projects** — 토큰 보상이 엔진이라 우리 구조에서 작동하지 않는다.

---

- [x] G1: `lib/insights.ts` 가 게시 소재를 **실측**으로 만든다. 하드코딩된 수치가 없다.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && npx tsx scripts/test-insights.ts 2>&1 | tail -14
  EXPECT: /INSIGHTS OK/
  EVIDENCE: ✓ 심볼 목록을 박아두지 않음 | INSIGHTS OK — 전부 실측

- [x] G2: 지출 상한을 코드가 강제한다 — 상한 초과 시 거부, 동시 호출 이중 과금 없음,
      읽기 전용이면 지출 거부, X 링크 가격이 13배로 반영됨.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && npx tsx scripts/test-social-budget.ts 2>&1 | tail -18
  EXPECT: /BUDGET OK/
  EVIDENCE: ✓ 무료 채널은 통과 (손해가 없으므로) | BUDGET OK — 상한이 코드로 강제됨

- [x] G3: 봇이 dry-run 을 기본으로 하고, 멘션에 중복 답글을 달지 않으며,
      게시 문구에 수익 약속이 0건이고, 문구의 모든 숫자가 insights 필드에서 온다.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && npx tsx scripts/test-social.ts 2>&1 | tail -20
  EXPECT: /SOCIAL OK/
  EVIDENCE: ✓ 저장 실패를 경고 | SOCIAL OK — 안 나가야 할 것은 안 나간다

- [x] G4: dry-run 실제 실행 — 외부로 나가는 요청 0건, 게시될 문장이 출력된다.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && npx tsx bot/social/run.ts --channel all --once --dry-run 2>&1 | tail -20
  EXPECT: /DRY-RUN/
  EVIDENCE: https://horofox.com/metrics | [x] 자격증명이 없어 멘션 조회를 건너뜁니다

- [x] G5: 두뇌를 재사용한다 — 소셜 커넥터가 `runAgent` 를 경유하고 에이전트 로직을 복제하지 않는다.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && bash -c 'U=$(grep -rl "runAgent" bot/ | wc -l | tr -d " "); D=$(grep -rc "generateText" bot/ | grep -v ":0" | wc -l | tr -d " "); echo "uses_runAgent=$U generateText_sites=$D"; [ "$D" = 1 ] && echo BRAIN-SHARED || echo BRAIN-DUPLICATED'
  EXPECT: /BRAIN-SHARED/
  EVIDENCE: uses_runAgent=4 generateText_sites=1 | BRAIN-SHARED

- [x] G6: 토큰 미설정 시 텔레그램과 같은 형식으로 친절히 실패한다 (기존 `test-bots.ts` 규약).
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && npx tsx scripts/test-bots.ts 2>&1 | tail -12
  EXPECT: /BOTS OK/
  EVIDENCE: ✓ README 에 토큰 발급처 안내 | BOTS OK — 설정 부재를 코드 결함과 구분

- [x] G7: 회귀 없음 — 기존 검증 전부 통과.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && bash -c 'npx tsx scripts/_reset-paper.ts >/dev/null 2>&1; F=0; N=0; for f in scripts/test-*.ts; do case "$f" in *deployed*|*posture*|*nosecrets*|*agent-e2e*) continue;; esac; N=$((N+1)); npx tsx "$f" >/dev/null 2>&1 || { echo "FAIL $f"; F=1; }; done; echo "ran=$N"; [ $F = 0 ] && echo NO-REGRESSION || echo REGRESSED'
  EXPECT: /NO-REGRESSION/
  EVIDENCE: ran=30 | NO-REGRESSION

- [x] G8: 빌드·타입 클린 + 시크릿 유출 0.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && bash -c 'T=$(npx tsc --noEmit 2>&1 | wc -l | tr -d " "); B=$(npm run build 2>&1 | grep -c "Compiled successfully"); S=$(npx tsx scripts/test-nosecrets.ts 2>&1 | grep -c "NOSECRETS OK"); echo "tsc=$T build=$B secrets_ok=$S"; [ "$T" = 0 ] && [ "$B" -ge 1 ] && [ "$S" = 1 ] && echo BUILD-OK || echo BUILD-BROKEN'
  EXPECT: /BUILD-OK/
  EVIDENCE: tsc=0 build=1 secrets_ok=1 | BUILD-OK

- [x] G9: 문서 — README 채널 표에 Farcaster/X 와 **비용·상한**이 명시되고, `.env.example` 에 신규 변수가 전부 있다.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && bash -c 'R=$(grep -ciE "farcaster" README.md); E=0; for v in NEYNAR_API_KEY NEYNAR_SIGNER_UUID FARCASTER_FID SOCIAL_DRY_RUN SOCIAL_MONTHLY_USD_CAP SOCIAL_POSTS_PER_DAY; do grep -q "$v" .env.example || { echo "missing $v"; E=1; }; done; echo "readme_farcaster=$R"; [ "$R" -ge 1 ] && [ "$E" = 0 ] && echo DOCS-OK || echo DOCS-MISSING'
  EXPECT: /DOCS-OK/
  EVIDENCE: readme_farcaster=3 | DOCS-OK

- [x] G10: 플레이스홀더 0 + 커밋 완료.
  CHECK: cd /Users/minpro/ZCodeProject/agent-terminal && bash -c 'P=$(grep -rnE "TODO|FIXME|not implemented" lib/ scripts/ app/ bot/ 2>/dev/null | wc -l | tr -d " "); D=$(git status --porcelain | grep -c . | tr -d " "); echo "placeholders=$P dirty=$D"; [ "$P" = 0 ] && [ "$D" = 0 ] && echo CLEAN || echo DIRTY'
  EXPECT: /CLEAN/
  EVIDENCE: placeholders=0 dirty=0 | CLEAN

<!--
- 체크박스는 gate-check.mjs 가 CHECK 실행 후 EXPECT 매칭되면 뒤집는다.
- EVIDENCE가 pending인 채로 체크된 박스는 미달로 친다.
- 불가능해진 게이트는 삭제하지 말고 ABANDON: G<n> <사유> 를 추가한다.
-->
