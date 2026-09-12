# horofox design contract

## 0. Research Log

- Existing product surface inspected: \`app/globals.css\`, landing, terminal, metrics, and dashboard screenshots.
- Report direction: operational dark terminal surface, reused for a static implementation closeout document.
- No external brand or screenshot clone was requested. The report uses the existing product language rather than introducing a new visual identity.

## 1. Direction

The report is a dark, evidence-first engineering document. Green means verified or actionable, yellow means an external gate or accepted limitation, and muted blue-gray carries explanatory text. Monospace typography keeps the report aligned with the Agent Terminal product.

## 2. Color tokens

| Token | Value | Usage |
| --- | --- | --- |
| \`--bg\` | \`#080c12\` | Page background |
| \`--panel\` | \`#101722\` | Tables, cards, flow nodes |
| \`--panel-2\` | \`#0c131c\` | Inline code |
| \`--line\` | \`#243244\` | Borders and dividers |
| \`--text\` | \`#d8e4f2\` | Primary copy |
| \`--muted\` | \`#8b9bb0\` | Metadata and captions |
| \`--green\` | \`#4ade80\` | Verified, links, success |
| \`--yellow\` | \`#fbbf24\` | External gates and warnings |
| \`--red\` | \`#f87171\` | Failure states |

Additional report surface colors live as named CSS variables in \`public/report.html\`; raw colors are kept inside \`:root\` so the document has one source of truth.

## 3. Typography

- Primary and report body: \`ui-monospace, SF Mono, Menlo, Consolas, monospace\`.
- Font sizes and line heights are centralized as \`--font-*\` and \`--line-*\` tokens.
- Display title: responsive \`clamp(26px, 4vw, 48px)\`, bold.
- Section title: 22px; body: 14px; metadata/captions: 12px.
- Korean copy must wrap naturally; long hashes, commands, and code use emergency wrapping at narrow widths.

## 4. Spacing and layout

- Content max width: 1180px.
- Component padding, gaps, radii, borders, and content widths are centralized as \`--space-*\`, \`--radius-*\`, \`--border-width\`, and \`--*-max/gutter\` tokens.
- Desktop: two-column evidence cards and two-column screenshot gallery.
- Mobile breakpoint: 820px; all grids collapse to one column and tables use fixed layout with breakable cells.
- The document owns vertical scrolling; no nested horizontal page overflow is allowed.

## 5. Primitives

### ReportCard

- Structure: section heading, bordered card, body copy or metric.
- Variants: \`good\`, \`warn\`.
- States: static; links retain visible focus and hover color.
- Accessibility: semantic headings and readable contrast.

### EvidenceTable

- Structure: \`table\`, \`thead\`, \`tbody\`.
- Variants: implementation inventory and validation matrix.
- Behavior: fixed layout, breakable cells, non-wrapping status token.
- Accessibility: header cells describe each column.

### ScreenshotFigure

- Structure: \`figure > img + figcaption\`.
- Behavior: image scales to container width; captions identify viewport and evidence meaning.
- Accessibility: every image has descriptive alt text.

### Disclosure

- Structure: native \`details/summary\`.
- Behavior: collapsed by default for reproducibility notes and file inventory.
- Accessibility: keyboard-operable native disclosure.

## 6. Motion

No decorative motion. Native smooth scrolling is the only motion and serves table-of-contents navigation. Reduced-motion users receive the same content and layout.

## 7. Depth

Mixed tonal surfaces and thin borders. Shadows are limited to report cards and do not carry semantic meaning.

## 8. Accessibility and accepted debt

- Target: readable contrast, semantic landmarks, alt text, keyboard-operable links and disclosures.
- Accepted debt: the captured product landing page is desktop-first and has page-wide horizontal overflow at 390px across navigation, CTAs, supporting text, hero copy, and the market panel; this is documented in the screenshot caption and belongs to the product follow-up, not the report shell.
- The report itself must remain within the viewport at 390px and must not split short Korean status labels into individual glyphs.
