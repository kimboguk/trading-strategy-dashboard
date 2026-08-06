"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMarketStore, useEnvStore } from "@/lib/store";
import type { Market } from "@/lib/types";

const NAV = {
  backtest: [
    { href: "/backtest", label: "Backtest", icon: "▶" },
    { href: "/signals", label: "Signals", icon: "◎" },
    { href: "/positions", label: "Positions", icon: "▤" },
  ],
  live: [
    { href: "/live", label: "Live Dashboard", icon: "◉" },
    { href: "/positions", label: "Positions", icon: "▤" },
    { href: "/live/orders", label: "Order Log", icon: "▦" },
  ],
};

const MARKETS: { value: Market; label: string }[] = [
  { value: "KRW", label: "KR" },
  { value: "USD", label: "US" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { market, setMarket } = useMarketStore();
  const { env, setEnv, autoTrade } = useEnvStore();

  // 라이브는 KR 전용 → 진입 시 KRW 고정
  useEffect(() => {
    if (env === "live" && market !== "KRW") setMarket("KRW");
  }, [env, market, setMarket]);

  const switchEnv = (e: "backtest" | "live") => {
    setEnv(e);
    router.push(e === "live" ? "/live" : "/backtest");
  };

  const items = NAV[env];

  return (
    <aside
      className="flex flex-col border-r"
      style={{ width: "var(--sidebar-w)", background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-base font-bold tracking-tight">ATH Breakout</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>US / KR 횡단면 전략</p>
      </div>

      {/* 환경 모드 토글 */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Environment</p>
        <div className="flex gap-1.5">
          {(["backtest", "live"] as const).map((e) => (
            <button
              key={e}
              onClick={() => switchEnv(e)}
              className="flex-1 text-sm py-1.5 rounded transition-colors capitalize"
              style={{
                background: env === e ? (e === "live" ? "var(--green)" : "var(--accent)") : "var(--bg-tertiary)",
                color: env === e ? "#fff" : "var(--text-secondary)",
                fontWeight: env === e ? 600 : 400,
              }}
            >
              {e === "live" ? "◉ Live" : "▶ Backtest"}
            </button>
          ))}
        </div>
        {env === "live" && (
          <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: autoTrade ? "var(--green)" : "var(--red)" }} />
            자동매매 {autoTrade ? "ON" : "OFF"}
          </div>
        )}
      </div>

      {/* Market selector */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Market</p>
        <div className="flex gap-1.5">
          {MARKETS.map((m) => {
            const locked = env === "live" && m.value === "USD";
            return (
              <button
                key={m.value}
                onClick={() => !locked && setMarket(m.value)}
                disabled={locked}
                title={locked ? "라이브는 KR 전용" : undefined}
                className="flex-1 text-sm py-1.5 rounded transition-colors disabled:opacity-30"
                style={{
                  background: market === m.value ? "var(--accent)" : "var(--bg-tertiary)",
                  color: market === m.value ? "#fff" : "var(--text-secondary)",
                  fontWeight: market === m.value ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <nav className="flex-1 py-3">
        {items.map((item) => {
          const active = item.href === "/live"
            ? pathname === "/live"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${active ? "font-semibold" : "hover:bg-white/5"}`}
              style={{
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "rgba(59,130,246,0.1)" : undefined,
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 text-xs border-t" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
        v0.3.0 · {env} · {market}
      </div>
    </aside>
  );
}
