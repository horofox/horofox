# Clone / design-system fidelity review — report closeout final 3

## Recommendation

**REQUEST_CHANGES**

## Evidence inspected

- Current live report: `http://127.0.0.1:3002/report.html` returned HTTP 200 on 2026-09-11 14:53 local time. Its served bytes matched `public/report.html` exactly.
- Design contract: `DESIGN.md`.
- Report source and current diff: `public/report.html`.
- Visual evidence: `public/report-assets/report.png` (1440x1100), `report-mobile.png` (390x844), `dashboard.png` (1440x1100), and `landing-mobile.png` (390x844). All four decode as PNGs. The report captures are newer than the final report source; `dashboard.png` is newer than `app/dashboard/dashboard.tsx`; the landing captures are newer than both `app/page.tsx` and `app/globals.css`.
- Live 390px browser measurement against the served report: `innerWidth=390`, `documentWidth=390`, `bodyWidth=390`, `wrapWidth=368`, and both evidence tables are 368px wide.
- Dashboard implementation: `app/dashboard/dashboard.tsx:48-90, 99-282`.
- Closeout logs: `.omo/evidence/report-closeout/{summary.md,report-mobile-geometry.log,full-regression.log,build.log}`.

## Findings

### CRITICAL

None. The report is a live semantic document: `public/report.html:84-252` uses `main`, `header`, `section`, headings, tables, links, native `details`, and `figure`/`figcaption`. Its only images are the six labelled product/API evidence captures at `public/report.html:194-199`; there is no canvas, raster/data-image, or CSS image substitute for the report UI.

### HIGH

1. **The landing-mobile accepted-debt disclosure still understates the observed scope.** The capture visibly clips the navigation, both CTAs, hero heading, supporting paragraph, and the market panel at 390px. `DESIGN.md:84` calls this page-wide overflow but enumerates navigation, CTAs, “hero copy,” and market panel; `public/report.html:195` weakens it further to “페이지 일부” and names only a long hero sentence. Neither explicitly records the clipped supporting text required by the target. The contract and gallery caption must plainly state page-wide 390px horizontal overflow across navigation, CTAs, hero and supporting text, and market panel.

2. **The declared token system does not fully drive typography and spacing.** `DESIGN.md:32,40` says fonts, spacing, and layout dimensions are centralized into tokens, but live component rules retain one-off values: `public/report.html:37` has a literal title `clamp(26px, 4vw, 48px)`, `:38-39` use literal 22px/16px heading sizes, `:43` and `:61` use literal 2px padding, `:56` uses a literal 13px table font, `:58` has a literal 4.2rem status width, and `:65` uses a literal 20px arrow size. This is a coherent partial token set, but it does not meet the stated rigorous token-driven contract. Define and consume tokens for these component values.

### MEDIUM

None.

### LOW

None.

## Verified strengths

- `public/report.html:9-28` centralizes the palette, most layout spacing, radii, widths, borders, shadows, and several type values. Shared card, grid, table, figure, disclosure, and responsive rules at `:46-80` render a real reusable static-report primitive set.
- `report-mobile.png` is readable in the inspected 390x844 frame: Korean title, lead, metadata/hash, TOC, and first verdict card remain legible without glyph-by-glyph status wrapping. The fresh live browser geometry independently confirms no page-level horizontal overflow.
- `dashboard.png` is a current populated product capture, not an error page or mock. It visibly matches the API-fed portfolio, paper positions, swap, launchpad, and revenue regions rendered by `app/dashboard/dashboard.tsx:67-90,113-282`.
- The report truthfully separates local verification from absent real paid settlement. `full-regression.log` records `FULL_REGRESSION ran=34 NO-REGRESSION`; `build.log` records a successful 19-route build with two dependency warnings.

## Blockers

1. Expand the accepted-debt wording in both the design contract and report caption to explicitly describe page-wide 390px overflow of navigation, CTAs, hero **and supporting** text, and market panel.
2. Replace the listed direct component typography/spacing literals with named tokens and update the design contract to match the implementation.
