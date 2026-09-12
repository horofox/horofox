# Report closeout evidence

- The report is served at \`/report.html\` and returned HTTP 200 from the local Next server.
- Six gallery image references were checked programmatically; all six PNG files exist under \`public/report-assets/\`.
- Fresh captures: \`report.png\` and \`report-mobile.png\` use explicit 1440px/390px Puppeteer viewports; product captures include \`landing.png\`, \`landing-mobile.png\`, \`terminal.png\`, \`metrics.png\`, \`dashboard.png\`, and \`brief-response.png\`. The dashboard was recaptured after a stale Next build cache had produced an error page.
- Mobile geometry after the responsive fix: \`innerWidth=390\`, \`documentWidth=390\`, \`bodyWidth=390\`, \`wrapWidth=368\`, \`tableWidth=368\`. Artifact: \`report-mobile-geometry.log\`.
- The final report caption and \`DESIGN.md\` accurately scope the product landing mobile debt as page-wide horizontal overflow; the report shell remains contained at 390px.
- Full regression rerun after the final product/report changes: \`FULL_REGRESSION ran=34 NO-REGRESSION\`. Artifact: \`full-regression.log\`.
- Fresh \`npm run build\` after the final changes exited 0, generated 19 static pages, and recorded two existing critical dependency warnings. Artifact: \`build.log\`.
- \`git diff --check\` passed.
- Actual Hedera paid settlement remains unverified because no funded testnet wallet, deployed paid URL, or confirmed Blocky402 facilitator is configured. The report intentionally says so and the demo script refuses false success.
