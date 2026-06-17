"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarketStore } from "@/lib/store";
import type { Market } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/backtest", label: "Backtest", icon: "▶" },
  { href: "/signals", label: "Signals", icon: "◎" },
  { href: "/positions", label: "Positions", icon: "▤" },
];

const MARKETS: { value: Market; label: string }[] = [
  { value: "KRW", label: "KR" },
  { value: "USD", label: "US" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { market, setMarket } = useMarketStore();

  return (
    <aside
      className="flex flex-col border-r"
      style={{
        width: "var(--sidebar-w)",
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-base font-bold tracking-tight">ATH Breakout</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          US / KR 횡단면 전략
        </p>
      </div>

      {/* Market selector */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Market</p>
        <div className="flex gap-1.5">
          {MARKETS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMarket(m.value)}
              className="flex-1 text-sm py-1.5 rounded transition-colors"
              style={{
                background: market === m.value ? "var(--accent)" : "var(--bg-tertiary)",
                color: market === m.value ? "#fff" : "var(--text-secondary)",
                fontWeight: market === m.value ? 600 : 400,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                active ? "font-semibold" : "hover:bg-white/5"
              }`}
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
      <div
        className="px-5 py-3 text-xs border-t"
        style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
      >
        v0.2.0 · {market}
      </div>
    </aside>
  );
}
