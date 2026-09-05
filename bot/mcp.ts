#!/usr/bin/env node
// MCP 서버 — Claude·Cursor·ChatGPT 안에서 우리 데이터를 직접 부르게 한다.
//
// 왜 이게 발견 계층인가: 에이전트가 우리를 "쓰려면" 먼저 우리를 **알아야** 한다.
// llms.txt 와 매니페스트는 스스로 찾아오는 에이전트를 위한 것이고,
// MCP 는 사람이 자기 에이전트에 우리를 **꽂아 넣는** 경로다. 둘 다 필요하다.
//
// 도구 목록은 lib/x402/catalog.ts 에서 온다 — 여기 따로 적으면 매니페스트와 어긋난다.
//
// 실행:  npx tsx bot/mcp.ts
// 등록:  claude mcp add horofox -- npx tsx /절대경로/bot/mcp.ts

import "../lib/env";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_SPECS, SERVICE } from "../lib/x402/catalog";

const BASE = process.env.HOROFOX_API_BASE ?? SERVICE.baseUrl();

const server = new Server(
  { name: "horofox", version: "2.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_SPECS.map((t) => ({
    name: t.name,
    // 모델이 도구를 고를 때 읽는 문장이다. 기능만 적으면 언제 써야 할지 모른다.
    description: `${t.summary} ${t.whyPaid}`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        t.params.map((p) => [p.name, { type: "string", description: p.description }]),
      ),
      required: t.params.filter((p) => p.required).map((p) => p.name),
    },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const spec = TOOL_SPECS.find((t) => t.name === req.params.name);
  if (!spec) {
    return { isError: true, content: [{ type: "text", text: `unknown tool: ${req.params.name}` }] };
  }

  const url = new URL(`${BASE}/api/x402`);
  url.searchParams.set("tool", spec.name);
  for (const p of spec.params) {
    const v = (req.params.arguments as Record<string, unknown> | undefined)?.[p.name];
    if (v !== undefined && v !== null) url.searchParams.set(p.name, String(v));
  }

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const body = await res.text();

    // 402 는 오류가 아니라 "값을 치르면 준다"는 응답이다.
    // 그대로 삼키면 모델이 실패로 오해하므로, 결제가 필요하다는 사실을 그대로 전한다.
    if (res.status === 402) {
      return {
        isError: false,
        content: [{
          type: "text",
          text:
            `Payment required (HTTP 402).\n` +
            `This endpoint is priced per call over x402. The payment requirements are below; ` +
            `an x402-capable client can settle and retry.\n\n${body}`,
        }],
      };
    }
    if (!res.ok) {
      return { isError: true, content: [{ type: "text", text: `HTTP ${res.status}: ${body.slice(0, 400)}` }] };
    }
    return { content: [{ type: "text", text: body }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text", text: `request failed: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
  // stdout 은 프로토콜 전용이다. 로그는 stderr 로만 낸다.
  console.error(`horofox MCP ready — ${TOOL_SPECS.length} tools against ${BASE}`);
}

main().catch((e) => {
  console.error("MCP 서버 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
