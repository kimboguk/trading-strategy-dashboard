"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useEnvStore } from "@/lib/store";
import { getLiveConfig, getLiveDashboard, setAutoTrade, syncAndRun } from "@/lib/api";
import type { LiveDashboard, LiveConfig } from "@/lib/types";

const EquityCurve = dynamic(() => import("@/components/charts/EquityCurve").then((m) => m.EquityCurve), { ssr: false });

const won = (v?: number | null) => (v == null ? "-" : `₩${Math.round(v).toLocaleString()}`);

export default function LiveDashboardPage() {
  const { setEnv, setAutoTrade: setAutoTradeStore } = useEnvStore();
  const [cfg, setCfg] = useState<LiveConfig | null>(null);
  const [d, setD] = useState<LiveDashboard | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEnv("live"); }, [setEnv]);

  const load = useCallback(async () => {
    try {
      const [c, dash] = await Promise.all([getLiveConfig(), getLiveDashboard("KRW")]);
      setCfg(c); setD(dash); setAutoTradeStore(c.auto_trade);
    } catch (e: any) { setError(e.message); }
  }, [setAutoTradeStore]);

  useEffect(() => { load(); }, [load]);

  const runCycle = async () => {
    setRunning(true); setError(null); setProgress("시작...");
    try {
      await syncAndRun("KRW", undefined, (_p, msg) => setProgress(msg || ""));
      await load();
    } catch (e: any) { setError(e.message || "실패"); }
    finally { setRunning(false); setProgress(""); }
  };

  const toggleAuto = async () => {
    if (!cfg) return;
    const turningOn = !cfg.auto_trade;
    let confirm: string | undefined;
    if (turningOn && cfg.kiwoom_env === "real") {
      confirm = window.prompt("실전 자동매매 활성화 — 계좌 뒤 4자리 입력:") || "";
    }
    try {
      const c = await setAutoTrade(turningOn, confirm);
      setCfg(c); setAutoTradeStore(c.auto_trade);
    } catch (e: any) { setError(e.message); }
  };

  const cap = d?.capital;
  const brokerOff = !cfg?.broker_configured;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold">Live Dashboard · KR</h2>
        {d?.as_of && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>as of {d.as_of}</span>}
        {cfg && (
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: cfg.kiwoom_env === "real" ? "rgba(239,68,68,0.15)" : "var(--bg-tertiary)", color: cfg.kiwoom_env === "real" ? "var(--red)" : "var(--text-secondary)" }}>
            {cfg.execution_mode} · {cfg.kiwoom_env}
          </span>
        )}
        <button onClick={runCycle} disabled={running}
          className="text-sm font-semibold px-4 py-1.5 rounded disabled:opacity-50 ml-auto"
          style={{ background: "var(--green)", color: "#fff" }}>
          {running ? `동기화 중... ${progress}` : "Sync + Run today"}
        </button>
      </div>

      {error && <p className="text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>{error}</p>}

      {/* 신선도 경고 */}
      {d?.freshness?.stale && (
        <p className="text-xs rounded p-2" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
          ⚠ 데이터 신선도: rt_* ({d.freshness.rt_max}) 가 market_data ({d.freshness.market_data_max}) 보다 과거 — Sync 필요
        </p>
      )}

      {/* 자동매매 스위치 */}
      <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div>
          <p className="text-sm font-semibold">자동매매 (Auto-Trade)</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {brokerOff ? "브로커 미연결 — 키움 키/계좌 설정 후 활성화 가능 (현재 표시 전용)" :
             cfg?.auto_trade ? `ON · 사이클 주문 자동 제출 (${cfg.kiwoom_env})` : "OFF · 오늘 주문은 수동 집행"}
          </p>
        </div>
        <button onClick={toggleAuto} disabled={brokerOff}
          className="relative w-14 h-7 rounded-full transition-colors disabled:opacity-40"
          style={{ background: cfg?.auto_trade ? "var(--green)" : "var(--bg-tertiary)" }}
          title={brokerOff ? "브로커 미연결" : undefined}>
          <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: cfg?.auto_trade ? "30px" : "2px" }} />
        </button>
      </div>

      {/* 당일 자동주문 카운트 */}
      {d?.auto_orders && d.auto_orders.total > 0 && (
        <div className="rounded-lg px-4 py-2 flex items-center gap-4 text-xs" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-secondary)" }}>오늘 자동주문 ({d.as_of}):</span>
          <span style={{ color: "var(--green)" }}>제출 {d.auto_orders.submitted}</span>
          <span style={{ color: "var(--red)" }}>실패 {d.auto_orders.failed}</span>
          <span style={{ color: "var(--text-secondary)" }}>스킵 {d.auto_orders.skipped}</span>
          <a href="/live/orders" className="ml-auto underline" style={{ color: "var(--text-secondary)" }}>주문 로그 →</a>
        </div>
      )}

      {/* 전략 가상 장부 (Forward) */}
      {cap && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-secondary)" }}>
            전략 가상 장부 (Forward · 초기 ₩10,000,000)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card label="Forward Equity" value={won(cap.equity)} />
            <Card label="Cash" value={won(cap.cash)} />
            <Card label="Positions" value={won(cap.positions_value)} />
            <Card label="Daily" value={`${(cap.daily_return_pct ?? 0) >= 0 ? "+" : ""}${(cap.daily_return_pct ?? 0).toFixed(2)}%`} color={(cap.daily_return_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)"} />
            <Card label="Cumulative" value={`${(cap.cum_return_pct ?? 0) >= 0 ? "+" : ""}${(cap.cum_return_pct ?? 0).toFixed(2)}%`} color={(cap.cum_return_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)"} />
          </div>
        </div>
      )}

      {/* 키움 모의계좌 (실제 브로커 — 체결 반영) */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
          키움 {cfg?.kiwoom_env ?? "mock"} 계좌 (실제 체결)
          {cfg?.account_masked && <span style={{ color: "var(--text-primary)" }}>{cfg.account_masked}</span>}
        </h3>
        {!d?.broker ? (
          <Empty text="브로커 미연결 — .env 키움 키/계좌 + EXECUTION_MODE=kiwoom" />
        ) : (d.broker as any).error ? (
          <p className="text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>연동 오류: {(d.broker as any).error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card label="예수금 (Cash)" value={won((d.broker as any).cash)} />
              <Card label="총평가 (Eval)" value={won((d.broker as any).total_eval)} />
              <Card label="보유종목" value={`${((d.broker as any).holdings ?? []).length}개`} />
            </div>
            {((d.broker as any).holdings ?? []).length > 0 && (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs font-mono">
                  <thead><tr style={{ color: "var(--text-secondary)" }}><th className="text-left py-1">Ticker</th><th className="text-right">Qty</th><th className="text-right">Avg</th><th className="text-right">Eval</th></tr></thead>
                  <tbody>
                    {(d.broker as any).holdings.map((h: any, i: number) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1">{h.ticker}</td><td className="text-right">{h.qty?.toLocaleString() ?? "-"}</td>
                        <td className="text-right">{h.avg_price?.toLocaleString() ?? "-"}</td><td className="text-right">{won(h.eval)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* 오늘 실행: 진입(어제 신호) + 청산 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`진입 실행${d?.as_of ? " · 진입일 " + d.as_of : ""}`}>
          {(d?.entries_today ?? []).length === 0 ? <Empty text="진입 실행 대상 없음" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr style={{ color: "var(--text-secondary)" }}>
                  <th className="text-left py-1">Ticker</th><th className="text-left">신호일</th>
                  <th className="text-right">수량</th><th className="text-right">진입가</th>
                  <th className="text-right">TP</th><th className="text-right">SL</th><th className="text-center">상태</th>
                </tr></thead>
                <tbody>
                  {d!.entries_today.map((e, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1">{e.ticker}</td><td>{e.signal_date}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{e.shares?.toLocaleString()}주</td>
                      <td className="text-right">{e.entry_price?.toLocaleString() ?? "-"}</td>
                      <td className="text-right" style={{ color: "var(--green)" }}>{e.tp_price != null ? Math.round(e.tp_price).toLocaleString() : "-"}</td>
                      <td className="text-right" style={{ color: "var(--red)" }}>{e.sl_price != null ? Math.round(e.sl_price).toLocaleString() : "-"}</td>
                      <td className="text-center" style={{ color: e.status === "open" ? "var(--accent)" : "var(--text-secondary)" }}>{e.status === "open" ? "보유중" : e.status === "closed" ? "당일청산" : e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] mt-2" style={{ color: "var(--text-secondary)" }}>
            신호일 종가 + 진입일 시가의 평균가로 체결. 신호일과 진입일은 주말·휴장으로 하루 이상 벌어질 수 있음.
          </p>
        </Panel>

        <Panel title="오늘 청산 (SELL)">
          {(d?.exits ?? []).length === 0 ? <Empty text="오늘 청산 없음" /> : (
            <ul className="text-xs font-mono space-y-1">
              {d!.exits.map((s: any, i) => (
                <li key={i}>
                  <span style={{ color: "var(--red)" }}>{s.ticker}</span> {s.reason ?? ""}{" "}
                  {s.pnl_pct != null && <span style={{ color: s.pnl_pct >= 0 ? "var(--green)" : "var(--red)" }}>{s.pnl_pct >= 0 ? "+" : ""}{s.pnl_pct.toFixed(1)}%</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* 신규 발생 신호 — 다음 거래일 진입 예정 (미리 확인) */}
      <Panel title={`신규 발생 신호${d?.picks_are_today ? " · 신호일 " + d.as_of : ""}`}>
        {d && !d.picks_are_today ? (
          <p className="text-xs rounded px-2 py-2" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
            신호일 {d.as_of} 신규 발생 없음 · 최근 신호일 {d.latest_signal_date ?? "-"} (아래 신호 이력 참고)
          </p>
        ) : (<>
          {d?.sizing && (
            <p className="text-xs mb-2 rounded px-2 py-1" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              슬롯 배분: 자본 {won(d.sizing.equity)} × {(d.sizing.slot_fraction * 100).toFixed(0)}% ≈{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{won(d.sizing.slot_notional)}/종목</span>
              {" · "}TP +{(d.sizing.tp_pct * 100).toFixed(0)}% / SL −{(d.sizing.sl_pct * 100).toFixed(0)}%
            </p>
          )}
          {(d?.picks ?? []).length === 0 ? <Empty text="신규 발생 신호 없음" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr style={{ color: "var(--text-secondary)" }}>
                  <th className="text-left py-1">#</th><th className="text-left">Ticker</th>
                  <th className="text-right">Close</th><th className="text-right">Vol×</th>
                  <th className="text-right">제안수량</th><th className="text-right">금액</th>
                  <th className="text-right">TP</th><th className="text-right">SL</th>
                </tr></thead>
                <tbody>
                  {d!.picks.map((p) => (
                    <tr key={p.ticker} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1">{p.rank}</td><td>{p.ticker}</td>
                      <td className="text-right">{p.close?.toLocaleString() ?? "-"}</td>
                      <td className="text-right">{p.volume && p.prev_volume ? (p.volume / p.prev_volume).toFixed(1) : "-"}</td>
                      <td className="text-right" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{p.suggested_shares != null ? p.suggested_shares.toLocaleString() + "주" : "-"}</td>
                      <td className="text-right">{p.suggested_notional != null ? "₩" + Math.round(p.suggested_notional).toLocaleString() : "-"}</td>
                      <td className="text-right" style={{ color: "var(--green)" }}>{p.tp_price != null ? Math.round(p.tp_price).toLocaleString() : "-"}</td>
                      <td className="text-right" style={{ color: "var(--red)" }}>{p.sl_price != null ? Math.round(p.sl_price).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d?.entry_due && (
            <p className="text-xs mt-2 rounded px-2 py-1" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
              진입 예정일: <b>{d.entry_due.date}</b> <span style={{ color: "var(--text-secondary)" }}>
                (신호일 다음 <b>거래일</b> — 주말·휴장은 건너뜀{d.entry_due.exact ? "" : ", 추정"})
              </span>
            </p>
          )}
          <p className="text-[10px] mt-2" style={{ color: "var(--text-secondary)" }}>
            신호일 종가에 발생 → 진입 예정일 시가 매수. 제안수량/금액은 슬롯 기준 참고값.
          </p>
        </>)}
      </Panel>

      {/* 보유 포지션 */}
      <Panel title={`보유 포지션 (${d?.open_positions?.length ?? 0})`}>
        {(d?.open_positions ?? []).length === 0 ? <Empty text="보유 없음" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead><tr style={{ color: "var(--text-secondary)" }}>
                <th className="text-left py-1">Ticker</th><th className="text-right">Shares</th><th className="text-right">Entry</th><th className="text-right">Last</th><th className="text-right">Unrealized</th><th className="text-right">%</th>
              </tr></thead>
              <tbody>
                {d!.open_positions.map((p, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1">{p.ticker}</td><td className="text-right">{p.shares.toLocaleString()}</td>
                    <td className="text-right">{p.entry_price?.toLocaleString() ?? "-"}</td><td className="text-right">{p.last_close.toLocaleString()}</td>
                    <td className="text-right" style={{ color: p.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" }}>{p.unrealized_pnl >= 0 ? "+" : ""}{Math.round(p.unrealized_pnl).toLocaleString()}</td>
                    <td className="text-right" style={{ color: p.unrealized_pct >= 0 ? "var(--green)" : "var(--red)" }}>{p.unrealized_pct >= 0 ? "+" : ""}{p.unrealized_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 신호 이력 (주문 여부와 무관 — 발생한 모든 신호 + 결과) */}
      <Panel title={`신호 이력 (${d?.signal_history?.length ?? 0})`}>
        {(d?.signal_history ?? []).length === 0 ? <Empty text="신호 이력 없음" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead><tr style={{ color: "var(--text-secondary)" }}>
                <th className="text-left py-1">신호일</th><th className="text-left">Ticker</th><th className="text-right">신호가</th>
                <th className="text-center">상태</th><th className="text-right">진입</th><th className="text-right">청산</th><th className="text-right">손익</th>
              </tr></thead>
              <tbody>
                {d!.signal_history.map((s, i) => {
                  const label = s.status === "closed" ? "청산" : s.status === "open" ? "보유중"
                    : s.status === "pending" ? "진입대기" : s.status === "skipped" ? "미진입"
                    : "미집행";
                  const color = s.status === "closed" ? (s.pnl_pct != null && s.pnl_pct >= 0 ? "var(--green)" : "var(--red)")
                    : s.status === "open" ? "var(--accent)" : "var(--text-secondary)";
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1">{s.signal_date}</td>
                      <td>{s.ticker}</td>
                      <td className="text-right">{s.close_at_signal?.toLocaleString() ?? "-"}</td>
                      <td className="text-center" style={{ color }}>{label}{s.exit_reason ? ` (${s.exit_reason})` : ""}</td>
                      <td className="text-right">{s.entry_price ? `${s.entry_date?.slice(5)} @${Math.round(s.entry_price).toLocaleString()}` : "-"}</td>
                      <td className="text-right">{s.exit_price ? `${s.exit_date?.slice(5)} @${Math.round(s.exit_price).toLocaleString()}` : "-"}</td>
                      <td className="text-right" style={{ color: s.pnl_pct != null ? (s.pnl_pct >= 0 ? "var(--green)" : "var(--red)") : undefined }}>
                        {s.pnl_pct != null ? `${s.pnl_pct >= 0 ? "+" : ""}${s.pnl_pct.toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] mt-2" style={{ color: "var(--text-secondary)" }}>
          거래(주문) 여부와 무관하게 발생한 신호를 기록. 미집행=신호만 발생, 미진입=자금/데이터 사유 skip.
        </p>
      </Panel>

      {/* Forward Equity */}
      {(d?.equity_series ?? []).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-secondary)" }}>Forward Equity</h3>
          <EquityCurve data={d!.equity_series} height={200} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>{title}</h3>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return text ? <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{text}</p> : null;
}
