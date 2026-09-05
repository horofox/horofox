"use client";

import Link from "next/link";
import { LangSwitch, useLang } from "@/components/LangProvider";
import LiveTicker from "@/components/LiveTicker";
import type { DictKey } from "@/lib/i18n";

// 순서가 곧 설계다.
// 이전 버전은 면책이 첫 화면 절반을 먹어서 "이게 뭔지 모르겠다"는 소리를 들었다.
// 지금은 ① 무엇인지 한 줄 ② 살아있는 증거(숫자) ③ 기능 ④ 정직성 ⑤ 요금 순이다.
// 정직성 섹션은 없애지 않았다 — 위치만 내렸다.

const FEATURES: [DictKey, DictKey, string][] = [
  ["feat.assets.title", "feat.assets.desc", "📈"],
  ["feat.sign.title", "feat.sign.desc", "✍️"],
  ["feat.fee.title", "feat.fee.desc", "🔍"],
  ["feat.keys.title", "feat.keys.desc", "🔑"],
  ["feat.surfaces.title", "feat.surfaces.desc", "💬"],
  ["feat.safety.title", "feat.safety.desc", "🛡️"],
];

export default function Landing() {
  const { t } = useLang();

  return (
    <main className="landing">
      <nav className="nav">
        <span className="brand">horofox</span>
        <span className="nav-links">
          <LangSwitch />
          <Link href="/metrics">{t("nav.metrics")}</Link>
          <a href="/dashboard">{t("nav.dashboard")}</a>
          <Link href="/terminal" className="nav-cta">{t("nav.terminal")}</Link>
        </span>
      </nav>

      <section className="hero">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{t("hero.title")}</h1>
        <p className="sub">{t("hero.sub")}</p>
        <div className="cta-row">
          <Link href="/terminal" className="cta-primary">{t("hero.cta.try")}</Link>
          <a href="/api/v1/metrics" className="cta-ghost">{t("hero.cta.code")}</a>
        </div>
        <p className="hero-note">{t("hero.note")}</p>
      </section>

      {/* 말보다 숫자가 빠르다 */}
      <LiveTicker />

      <section className="grid">
        {FEATURES.map(([title, desc, icon]) => (
          <div key={title} className="card">
            <span className="card-icon">{icon}</span>
            <h3>{t(title)}</h3>
            <p>{t(desc)}</p>
          </div>
        ))}
      </section>

      <section className="pricing">
        <h2>{t("price.title")}</h2>
        <div className="price-line"><span>0.1%</span> — {t("price.fee")}</div>
        <p className="pricing-note">{t("price.note")}</p>
        <div className="price-line" style={{ marginTop: 18 }}>
          <span>$0.01</span> {t("price.perCall")} — {t("price.x402")}
        </div>
        <p className="pricing-note">{t("price.x402desc")}</p>
      </section>

      <section className="honesty">
        <h2>{t("honest.title")}</h2>
        <ul>
          <li><b>{t("honest.noPromise")}</b> {t("honest.backtest")}</li>
          <li>{t("honest.tool")}</li>
          <li>{t("honest.leverage")}</li>
        </ul>
      </section>

      <footer className="footer"><p>{t("footer.disclaimer")}</p></footer>
    </main>
  );
}
