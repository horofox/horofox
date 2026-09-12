# Manual QA — report fidelity Pass B

Verdict: PASS

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| VF-B1 | DASHBOARD-CURRENT | Dashboard screenshot | Open `/Users/minpro/ZCodeProject/agent-terminal/public/report-assets/dashboard.png` and compare visible sections with `app/dashboard/dashboard.tsx` (`rg -n "트레이더 대시보드|포트폴리오|퍼펫 포지션|신규 포지션|스왑|런치패드|수익" app/dashboard/dashboard.tsx`); inspect closeout regression/build logs | PASS | A1, A2, A3 |
| VF-B2 | REPORT-MOBILE-390 | Report mobile screenshot | Open `/Users/minpro/ZCodeProject/agent-terminal/public/report-assets/report-mobile.png`; `file .../report-mobile.png`; read `.omo/evidence/report-closeout/report-mobile-geometry.log` | PASS | A4, A5 |
| VF-B3 | REPORT-READABILITY | Report mobile rendered content | Direct screenshot inspection of `report-mobile.png`: title, Korean lead, metadata/hash, TOC, section heading, and first verdict card remain within the 390px frame; cross-check `public/report.html:79,95-113` | PASS | A4, A6 |
| VF-B4 | LANDING-MOBILE-DEBT | Report gallery caption | Open `landing-mobile.png`, compare visible right-edge hero clipping with `public/report.html:195` and `DESIGN.md:84-85` | PASS | A7, A8, A9 |
| VF-B5 | REPORT-LAYOUT-FIDELITY | Report desktop/mobile styling | Open `report.png` and `report-mobile.png`; inspect `public/report.html:9-80` for declared tokens, responsive grid collapse, fixed table layout, breakable cells, and `overflow-x:hidden`; compare intent in `DESIGN.md:8-85` | PASS | A4, A6, A10 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| VF-B-A1 | REPORT-MOBILE-390 | viewport overflow / clipping | At 390px, report content and cards stay inside viewport; no horizontal document overflow | PASS | A4, A5 |
| VF-B-A2 | CJK-READABILITY | CJK orphaning / glyph splitting | Korean title, lead, metadata, buttons, badges, and status labels remain readable without one-glyph status wrapping or clipped baselines | PASS | A4, A6 |
| VF-B-A3 | DASHBOARD-CURRENT | stale/error capture | Dashboard image must show the actual current dashboard surface, not a stale Next error page or placeholder | PASS | A1, A2, A3 |
| VF-B-A4 | LANDING-MOBILE-DEBT | scope mismatch | Caption must describe only the product landing mobile clipping and explicitly separate it from report-shell responsiveness | PASS | A7, A8, A9 |
| VF-B-A5 | REPORT-LAYOUT-FIDELITY | raster/mock substitution | Report must be live semantic HTML/CSS with real text and structured cards/tables; screenshots are gallery assets only | PASS | A6, A10 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | screenshot | Current 1440×1100 dashboard with portfolio, positions, swap, launchpad, and revenue sections | `/Users/minpro/ZCodeProject/agent-terminal/public/report-assets/dashboard.png` |
| A2 | source | Dashboard component defining the visible headings and REST/API-backed panels | `/Users/minpro/ZCodeProject/agent-terminal/app/dashboard/dashboard.tsx` |
| A3 | log | Full regression evidence including `RUN scripts/test-dashboard.ts`, `DASHBOARD OK`, and current dashboard checks | `/Users/minpro/ZCodeProject/agent-terminal/.omo/evidence/report-closeout/full-regression.log` |
| A4 | screenshot | Fresh 390×844 report mobile render; visually inspected for clipping and readability | `/Users/minpro/ZCodeProject/agent-terminal/public/report-assets/report-mobile.png` |
| A5 | geometry log | Fresh measured report mobile geometry: inner/document/body width 390, wrap/table width 368, overflowNodes 0 | `/Users/minpro/ZCodeProject/agent-terminal/.omo/evidence/report-closeout/report-mobile-geometry.log` |
| A6 | source | Current report semantic HTML/CSS, responsive media query, token declarations, and gallery captions | `/Users/minpro/ZCodeProject/agent-terminal/public/report.html` |
| A7 | screenshot | 390×844 product landing capture showing the long hero line clipped at the right edge | `/Users/minpro/ZCodeProject/agent-terminal/public/report-assets/landing-mobile.png` |
| A8 | source | Report caption explicitly scopes landing-mobile clipping as a product follow-up | `/Users/minpro/ZCodeProject/agent-terminal/public/report.html` |
| A9 | contract | Design contract separates accepted landing-mobile debt from report-shell mobile requirements | `/Users/minpro/ZCodeProject/agent-terminal/DESIGN.md` |
| A10 | source | Report layout/fidelity contract: tokens, semantic cards/tables/figures, responsive collapse, and no horizontal overflow | `/Users/minpro/ZCodeProject/agent-terminal/DESIGN.md` |
