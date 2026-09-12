"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Portfolio {
  assets: { symbol: string; amount: number; usdPrice: number | null; usdValue: number | null }[];
  totalUsd: number;
}
interface Positions {
  positions: { coin: string; dir: 1 | -1; sizeCoin: number; entryPrice: number; marginUsdc: number; leverage: number; markPrice: number; unrealizedPnlUsd: number }[];
}
interface Launchpad {
  tokens: { symbol: string; name: string; reserveUsdc: number; reserveToken: number; feesUsdc: number; held: number }[];
  totalFeesUsdc: number;
}
interface Trades {
  event: string;
  ts: string;
}

interface Revenue {
  swapFeesUsdc: number;
  launchpadFeesUsdc: number;
  gatewayRevenueUsdc: number;
  totalRevenueUsdc: number;
  paperRevenueUsdc: number;
  /** 온체인 실수익. 위 페이퍼 항목과 별개다. */
  real: { builderFeesUsdc: number; configured: boolean; error: string | null; note: string };
  llmCostUsdc: number;
  netUsdc: number;
  selfSustaining: boolean;
}

interface Mode {
  ok: boolean;
  mode: "paper" | "live";
  reason: string;
  trader: string | null;
  builder: string | null;
  feePercent: number;
  network: "mainnet" | "testnet";
}

const num = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`/api/v1${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [pos, setPos] = useState<Positions | null>(null);
  const [pad, setPad] = useState<Launchpad | null>(null);
  const [trades, setTrades] = useState<Trades[] | null>(null);
  const [rev, setRev] = useState<Revenue | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const [p, po, pa, t, r, m] = await Promise.all([
      api<Portfolio>("/portfolio"),
      api<Positions>("/perps"),
      api<Launchpad>("/launchpad"),
      api<Trades[]>("/trades"),
      api<Revenue>("/revenue"),
      api<Mode>("/mode"),
    ]);
    setPf(p); setPos(po); setPad(pa); setTrades(t); setRev(r); setMode(m);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const act = async (path: string, body: Record<string, unknown>, label: string) => {
    setBusy(true); setMsg(`${label} 실행 중…`);
    const res = await api<{ ok: boolean; error?: string }>(path, { method: "POST", body: JSON.stringify(body) });
    setMsg(res?.ok ? `${label} ✅` : `${label} 실패: ${res?.error ?? "알 수 없는 오류"}`);
    setBusy(false);
    refresh();
  };

  const [swap, setSwap] = useState({ from: "usdc", to: "eth", amount: "50" });
  const [perp, setPerp] = useState({ coin: "ETH", direction: "long", marginUsdc: "25", leverage: "5" });
  const [launch, setLaunch] = useState({ name: "", symbol: "" });
  const [trade, setTrade] = useState({ symbol: "", usdcAmount: "10" });

  return (
    <main className="dash">
      <nav className="nav">
        <span className="brand">horofox / dashboard</span>
        <span className="nav-links">
          <Link href="/">랜딩</Link>
          <Link href="/terminal">터미널</Link>
        </span>
      </nav>

      <h1>트레이더 대시보드</h1>
      <p className="dash-sub">모든 동작은 REST API(<code>/api/v1/*</code>)로만 이뤄집니다 — 채팅 없이 도는 같은 시스템 · 5초 폴링</p>

      {msg && <div className="dash-msg">{msg}</div>}

      <section className="dash-grid">
        <div className="dash-card">
          <h2>포트폴리오</h2>
          <div className="total">
            ${num(pf?.totalUsd)}
          </div>
          <table>
            <thead><tr><th>자산</th><th>수량</th><th>현재가</th><th>평가($)</th></tr></thead>
            <tbody>
              {pf?.assets.map((a) => (
                <tr key={a.symbol}>
                  <td className="sym">{a.symbol.toUpperCase()}</td>
                  <td>{num(a.amount, 6)}</td>
                  <td>{num(a.usdPrice, 4)}</td>
                  <td>{num(a.usdValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dash-card">
          <h2>퍼펫 포지션 (Hyperliquid mark · paper)</h2>
          {pos?.positions.length === 0 && <p className="dim-text">포지션 없음</p>}
          <table>
            <tbody>
              {pos?.positions.map((p) => (
                <tr key={p.coin}>
                  <td className="sym">{p.coin} {p.dir === 1 ? " 롱" : " 숏"} {p.leverage}x</td>
                  <td>진입 {num(p.entryPrice)} → mark {num(p.markPrice)}</td>
                  <td className={p.unrealizedPnlUsd >= 0 ? "ok" : "err"}>
                    {p.unrealizedPnlUsd >= 0 ? "+" : ""}{num(p.unrealizedPnlUsd)} USD
                  </td>
                  <td>
                    <button disabled={busy} onClick={() => act("/close", { coin: p.coin }, `${p.coin} 청산`)}>
                      청산
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt">신규 포지션</h2>
          <div className="form-row">
            <input value={perp.coin} onChange={(e) => setPerp({ ...perp, coin: e.target.value.toUpperCase() })} placeholder="ETH" />
            <select value={perp.direction} onChange={(e) => setPerp({ ...perp, direction: e.target.value })}>
              <option value="long">롱</option>
              <option value="short">숏</option>
            </select>
            <input value={perp.marginUsdc} onChange={(e) => setPerp({ ...perp, marginUsdc: e.target.value })} placeholder="증거금 USDC" />
            <input value={perp.leverage} onChange={(e) => setPerp({ ...perp, leverage: e.target.value })} placeholder="레버리지" />
            <button disabled={busy} onClick={() => act("/perp", { coin: perp.coin, direction: perp.direction, marginUsdc: Number(perp.marginUsdc), leverage: Number(perp.leverage) }, "포지션 진입")}>
              진입
            </button>
          </div>
        </div>

        <div className="dash-card">
          <h2>스왑</h2>
          <div className="form-row">
            <input value={swap.from} onChange={(e) => setSwap({ ...swap, from: e.target.value.toLowerCase() })} placeholder="from" />
            <input value={swap.to} onChange={(e) => setSwap({ ...swap, to: e.target.value.toLowerCase() })} placeholder="to" />
            <input value={swap.amount} onChange={(e) => setSwap({ ...swap, amount: e.target.value })} placeholder="수량" />
            <button disabled={busy} onClick={() => act("/swap", { from: swap.from, to: swap.to, amount: Number(swap.amount) }, "스왑")}>
              스왑
            </button>
          </div>
          <p className="dim-text">실시세 체결 · 페이퍼 트레이딩</p>
        </div>

        <div className="dash-card">
          <h2>런치패드 <span className="dim-text">누적 수수료 ${num(pad?.totalFeesUsdc, 4)}</span></h2>
          <div className="paper-warn">
            ⚠ <b>페이퍼 본딩커브입니다 — 온체인 발행이 아닙니다.</b> 토큰도 유동성도 실재하지 않고,
            수수료는 로컬 파일에만 적립됩니다. 실제 매출은 builder 수수료뿐입니다.
          </div>
          <table>
            <thead><tr><th>토큰</th><th>가격</th><th>보유</th><th>수수료</th><th>매매</th></tr></thead>
            <tbody>
              {pad?.tokens.map((t) => (
                <tr key={t.symbol}>
                  <td className="sym">{t.symbol}</td>
                  <td>${num(t.reserveUsdc / t.reserveToken, 6)}</td>
                  <td>{num(t.held, 2)}</td>
                  <td>${num(t.feesUsdc, 4)}</td>
                  <td>
                    <button disabled={busy} onClick={() => act("/buy", { symbol: t.symbol, usdcAmount: Number(trade.usdcAmount) }, `${t.symbol} 매수`)}>▲</button>{" "}
                    <button disabled={busy} onClick={() => act("/sell", { symbol: t.symbol, tokenAmount: t.held }, `${t.symbol} 매도`)}>▼</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-row mt">
            <input value={launch.name} onChange={(e) => setLaunch({ ...launch, name: e.target.value })} placeholder="토큰 이름" />
            <input value={launch.symbol} onChange={(e) => setLaunch({ ...launch, symbol: e.target.value.toUpperCase() })} placeholder="SYMBOL" />
            <button disabled={busy} onClick={() => act("/launch", launch, `${launch.symbol} 발행`)}>발행</button>
          </div>
          <div className="form-row">
            <input value={trade.symbol} onChange={(e) => setTrade({ ...trade, symbol: e.target.value.toUpperCase() })} placeholder="SYMBOL" />
            <input value={trade.usdcAmount} onChange={(e) => setTrade({ ...trade, usdcAmount: e.target.value })} placeholder="USDC" />
            <button disabled={busy} onClick={() => act("/buy", { symbol: trade.symbol, usdcAmount: Number(trade.usdcAmount) }, `${trade.symbol} 매수`)}>매수</button>
          </div>
        </div>

        <div className="dash-card">
          <h2>수익 — 실수익과 페이퍼는 따로 본다</h2>

          <div className={mode?.mode === "live" ? "mode-bar live" : "mode-bar paper"}>
            <span className="mode-badge">{mode ? (mode.mode === "live" ? "● LIVE" : "○ PAPER") : "…"}</span>
            <span className="mode-why">
              {mode?.mode === "live"
                ? `${mode.network} · 실주문이 나갑니다`
                : `실주문 없음 — ${mode?.reason ?? "확인 중"}`}
            </span>
            {mode?.builder && (
              <span className="mode-meta">builder {mode.builder.slice(0, 6)}…{mode.builder.slice(-4)} · {mode.feePercent}%</span>
            )}
            {mode?.trader && (
              <span className="mode-meta">trader {mode.trader.slice(0, 6)}…{mode.trader.slice(-4)}</span>
            )}
          </div>

          <div className="real-rev">
            <span className="dim-text">온체인 builder 수수료 (실수익)</span>
            <div className={rev?.real?.configured ? "real-num ok" : "real-num"}>
              ${num(rev?.real?.builderFeesUsdc, 4)}
            </div>
            <span className="dim-text">
              {rev?.real?.error
                ? `조회 실패: ${rev.real.error}`
                : rev?.real?.note ?? "…"}
            </span>
          </div>

          <p className="dim-text" style={{ marginTop: 14 }}>아래는 <b>페이퍼</b> 집계 — 실제 돈이 아닙니다</p>
          <div className="rev-grid">
            <div><span className="dim-text">스왑 수수료</span><div className="rev-num">${num(rev?.swapFeesUsdc, 4)}</div></div>
            <div><span className="dim-text">런치패드 수수료</span><div className="rev-num">${num(rev?.launchpadFeesUsdc, 4)}</div></div>
            <div><span className="dim-text">게이트웨이 과금</span><div className="rev-num">${num(rev?.gatewayRevenueUsdc, 4)}</div></div>
            <div><span className="dim-text">페이퍼 합계</span><div className="rev-num">${num(rev?.paperRevenueUsdc, 4)}</div></div>
            <div><span className="dim-text">LLM 비용</span><div className="rev-num err">-${num(rev?.llmCostUsdc, 4)}</div></div>
            <div><span className="dim-text">순수익</span>
              <div className={rev?.selfSustaining ? "rev-num ok" : "rev-num err"}>
                {rev?.selfSustaining ? "흑자 ✅" : "적자 ⚠️"} ${num(rev?.netUsdc, 4)}
              </div>
            </div>
          </div>
          <p className="dim-text">
            페이퍼 수익은 LLM비 충당 시뮬레이션이고, <b>실제 매출은 위의 builder 수수료</b>뿐입니다.
            거래가 없으면 0.1% × 0 = $0.
          </p>
        </div>

        <div className="dash-card">
          <h2>체결 내역</h2>
          {trades?.length === 0 && <p className="dim-text">기록 없음</p>}
          <table>
            <tbody>
              {trades?.slice(0, 15).map((t, i) => (
                <tr key={i}>
                  <td className="sym">{t.event}</td>
                  <td className="dim-text">{new Date(t.ts).toLocaleTimeString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
