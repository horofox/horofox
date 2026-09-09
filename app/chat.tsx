"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import type { ToolUIPart, UIMessage } from "ai";

const EXAMPLES = [
  "BTC 가격 및 펀딩비 조회 (Hedera x402)",
  "SK하이닉스(HIP-3) 실시간 시세",
  "비트 10배 롱 100불 (0.1% builder code 부착)",
  "내 포트폴리오 및 수수료 정산 현황",
];

function toolLabel(type: string, state: ToolUIPart["state"]): string {
  const name = type.slice("tool-".length);
  const isX402 = ["price", "funding", "markets"].includes(name);
  const tag = isX402 ? " [Hedera x402 $0.01]" : "";
  if (state === "output-available") return `✓ ${name}${tag}`;
  if (state === "output-error") return `✗ ${name} 실패`;
  return `⏳ ${name}${tag} 결제 및 실행 중…`;
}

export default function Chat({ hasKey }: { hasKey: boolean }) {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");

  const busy = status === "submitted" || status === "streaming";

  const submit = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    sendMessage({ text });
    if (!overrideText) setInput("");
  };

  const renderPart = (part: UIMessage["parts"][number], i: number) => {
    if (part.type === "text") {
      return (
        <span key={i} className="text">
          {part.text}
        </span>
      );
    }
    if (part.type.startsWith("tool-")) {
      const t = part as ToolUIPart;
      const cls = t.state === "output-error" ? "tool-chip error" : t.state === "output-available" ? "tool-chip" : "tool-chip running";
      return (
        <span key={i} className={cls}>
          {toolLabel(part.type, t.state)}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="terminal">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot" />
          <h1>horofox</h1>
          <span style={{ fontSize: "12px", opacity: 0.8 }}>— Self-Funding Agent Terminal</span>
        </div>
        <div style={{ display: "flex", gap: 6, fontSize: "11px" }}>
          <span style={{ background: "rgba(74, 222, 128, 0.12)", color: "var(--accent)", border: "1px solid var(--accent-dim)", padding: "2px 8px", borderRadius: 999 }}>
            ⚡ Hedera x402 v2
          </span>
          <span style={{ background: "rgba(59, 130, 246, 0.12)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)", padding: "2px 8px", borderRadius: 999 }}>
            📈 HL Builder Fee 0.1%
          </span>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="hint">
            <p className="empty">자연어로 지시하면 에이전트가 거래 수수료를 벌어 x402 데이터를 결제합니다. 빠른 실행:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => submit(e)}
                  style={{
                    textAlign: "left",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    padding: "8px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "13px",
                  }}
                  onMouseOver={(ev) => (ev.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseOut={(ev) => (ev.currentTarget.style.borderColor = "var(--border)")}
                >
                  <span style={{ color: "var(--accent)", marginRight: 6 }}>›</span>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="role">{m.role === "user" ? "you>" : "agent>"}</span>
            {m.parts.map(renderPart)}
          </div>
        ))}

        {busy && (
          <div className="msg assistant">
            <span className="role">agent&gt;</span>
            <span className="hint">…</span>
          </div>
        )}

        {error && (
          <div className="error-line">에러: {error.message}</div>
        )}
      </div>

      {!hasKey && (
        <div className="notice">
          OPENAI_API_KEY가 설정되지 않았습니다. .env.local 을 만들고 키를 넣은 뒤 서버를
          다시 시작하세요. (OPENAI_BASE_URL로 Z.ai 등 OpenAI 호환 엔드포인트 사용 가능)
        </div>
      )}

      <div className="composer">
        <span className="prompt-mark">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="명령어를 입력하세요 (예: 비트 10배 롱 100불, BTC 펀딩비 조회)…"
          autoFocus
        />
        <button onClick={() => submit()} disabled={busy}>
          {busy ? "…" : "전송"}
        </button>
      </div>
    </div>
  );
}
