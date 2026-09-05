import "../lib/env";
import { SYSTEM } from "../lib/prompt";
import { tools } from "../lib/tools";

// 토큰은 대략 4자 = 1토큰 (영문). 한국어는 더 촘촘하다.
// 정확한 토크나이저 없이 재므로 **하한 추정**으로 쓴다.
const approx = (s: string) => Math.ceil(s.length / 4);

const sysChars = SYSTEM.length;
const toolJson = JSON.stringify(
  Object.fromEntries(Object.entries(tools).map(([k, v]: [string, any]) => [k, { d: v.description, p: v.inputSchema ?? v.parameters }])),
);
console.log(`시스템 프롬프트   ${sysChars.toLocaleString()}자  ≈ ${approx(SYSTEM).toLocaleString()}토큰`);
console.log(`도구 정의(${Object.keys(tools).length}개)   ${toolJson.length.toLocaleString()}자  ≈ ${approx(toolJson).toLocaleString()}토큰`);
console.log(`고정 입력 합계    ≈ ${(approx(SYSTEM) + approx(toolJson)).toLocaleString()}토큰 / 호출`);
console.log(`\nMEASURED fixedPromptTokens=${approx(SYSTEM) + approx(toolJson)} toolCount=${Object.keys(tools).length}`);
