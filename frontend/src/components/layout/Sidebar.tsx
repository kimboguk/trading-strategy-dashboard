"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/backtest", label: "Backtest", icon: "▶" },
  { href: "/compare", label: "Compare", icon: "⇆" },
  { href: "/optimize", label: "Optimize", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

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
        <h1 className="text-lg font-bold tracking-tight">Trading Strategy Dashboard</h1>
      </div>
      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                active
                  ? "font-semibold"
                  : "hover:bg-white/5"
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
        v0.1.0
      </div>
    </aside>
  );
}
