// 발견 계층 — 에이전트가 우리를 찾을 수 있는가.
//
// 네 표면(매니페스트·llms.txt·openapi·MCP)이 **같은 카탈로그에서 생성되는지** 검사한다.
// 따로 적으면 툴을 추가했을 때 한 곳만 고치고 나머지가 낡는다. 그게 이 파일이 막으려는 것이다.
import "../lib/env";
import { spawn } from "node:child_process";
import { TOOL_SPECS, SERVICE, manifest, llmsTxt, openapi } from "../lib/x402/catalog";
import { PRICE_USD, NETWORK } from "../lib/x402/server";

const PORT = 3496;

async function main() {
  let fail = 0;
  const t = (n: string, ok: boolean, x = "") => { if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); };

  console.log(`카탈로그 — 툴 ${TOOL_SPECS.length}개 · 단가 $${PRICE_USD} · hedera:${NETWORK}`);

  console.log("\n네 표면이 같은 툴 목록을 말하는가");
  const names = TOOL_SPECS.map((x) => x.name);
  const price = TOOL_SPECS.find((x) => x.name === "price");
  const brief = TOOL_SPECS.find((x) => x.name === "brief");
  const m = manifest();
  const o = openapi();
  const l = llmsTxt();
  const lFlat = l.replace(/\s+/g, " ");   // 줄바꿈 위치에 검사가 좌우되면 안 된다
  t("매니페스트 리소스 수 일치", m.resources.length === names.length, `${m.resources.length}/${names.length}`);
  t("매니페스트가 전 툴을 담음", names.every((n) => m.resources.some((r) => r.url.endsWith(`tool=${n}`))));
  t("openapi 경로 수 일치", Object.keys(o.paths).length === names.length);
  t("openapi 가 전 툴을 담음", names.every((n) => `/api/x402?tool=${n}` in o.paths));
  t("llms.txt 가 전 툴을 담음", names.every((n) => l.includes(`### ${n}`)));
  t("brief 가 단일 유료 시장 판단 결과를 노출", brief?.returns.includes("perpCaveat") === true && brief.returns.includes("measuredAt"));
  t("brief 에만 insight 필터가 있다",
    price?.params.length === 1 && brief?.params.some((p) => p.name === "limit") === true && brief.params.some((p) => p.name === "equitiesOnly") === true,
  );

  console.log("\n가격·네트워크가 한 곳에서 나오는가");
  t("매니페스트 가격이 상수와 일치", m.resources.every((r) => r.accepts[0].price === `$${PRICE_USD}`), `$${PRICE_USD}`);
  t("매니페스트 네트워크가 상수와 일치", m.resources.every((r) => r.accepts[0].network === `hedera:${NETWORK}`));
  t("llms.txt 에 가격 명시", l.includes(`$${PRICE_USD}`));
  t("x402Version 2", m.x402Version === 2);

  console.log("\n에이전트가 판단할 근거가 있는가");
  t("모든 툴에 whyPaid 가 있다", TOOL_SPECS.every((x) => x.whyPaid.length > 40));
  t("llms.txt 가 'Why it is worth paying' 를 담음", (l.match(/Why it is worth paying/g) ?? []).length === names.length);
  t("필수 파라미터가 명시됨", TOOL_SPECS.filter((x) => x.params.length > 0).every((x) => x.params.some((p) => typeof p.required === "boolean")));

  console.log("\n정직성 — 과장 없이 한계를 밝히는가");
  t("퍼프이지 주식이 아님을 명시", /perpetual futures/.test(lFlat) && /not shares/.test(lFlat));
  t("프리IPO 가 내재가치임을 명시", /implied valuation/.test(lFlat));
  t("대상 기업이 승인하지 않았음을 명시", /do not endorse/.test(lFlat));
  t("휴면 dex 경고", /dormant/.test(lFlat));
  t("수익 약속 표현 없음", !/guaranteed|risk-free|profit|100x/i.test(l));

  console.log("\nMCP 서버가 같은 목록을 내는가");
  const mcp = spawn("npx", ["tsx", "bot/mcp.ts"], { stdio: ["pipe", "pipe", "pipe"] });
  try {
    const out = await new Promise<string>((resolve) => {
      let buf = "";
      mcp.stdout.on("data", (d) => {
        buf += d.toString();
        if (buf.includes('"tools":[')) resolve(buf);   // capabilities 의 "tools":{} 와 구분한다
      });
      setTimeout(() => resolve(buf), 25_000);
      mcp.stdin.write(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }) + "\n");
      setTimeout(() => {
        mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
      }, 3000);
    });
    const listed = names.filter((n) => out.includes(`"${n}"`));
    t("MCP 가 전 툴을 노출", listed.length === names.length, `${listed.length}/${names.length}`);
    t("MCP 설명에 whyPaid 포함", TOOL_SPECS.every((x) => out.includes(x.whyPaid.slice(0, 30))));
  } finally { mcp.kill("SIGKILL"); }

  console.log("\nHTTP — 세 경로가 실제로 뜨는가");
  const srv = spawn("npx", ["next", "dev", "-p", String(PORT)], { stdio: "ignore", detached: true });
  try {
    const base = `http://127.0.0.1:${PORT}`;
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      try { const r = await fetch(`${base}/.well-known/x402`); if (r.status < 500) break; } catch { /* 대기 */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    for (const [path, check] of [
      ["/.well-known/x402", (b: string) => JSON.parse(b).x402Version === 2],
      ["/llms.txt", (b: string) => b.startsWith("# ")],
      ["/openapi.json", (b: string) => JSON.parse(b).openapi === "3.1.0"],
    ] as [string, (b: string) => boolean][]) {
      const r = await fetch(`${base}${path}`);
      const body = await r.text();
      t(`${path} → 200`, r.status === 200, `HTTP ${r.status}`);
      t(`${path} 내용 유효`, (() => { try { return check(body); } catch { return false; } })());
    }
    const mf = await (await fetch(`${base}/.well-known/x402`)).json() as { resources: { url: string }[] };
    t("매니페스트 URL 이 실제 엔드포인트를 가리킴", mf.resources.every((r) => r.url.includes("/api/x402?tool=")));
  } finally { try { process.kill(-srv.pid!, "SIGKILL"); } catch { /* 종료됨 */ } }

  console.log(fail === 0 ? "\nDISCOVERY OK — 네 표면이 한 카탈로그에서 나온다" : `\nDISCOVERY FAIL — ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("DISCOVERY FAIL —", e instanceof Error ? e.message : e); process.exit(1); });
