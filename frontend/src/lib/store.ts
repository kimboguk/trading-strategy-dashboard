import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Market,
  BacktestRequest,
  BacktestStats,
  TradeRecord,
  YearlyRow,
  EquityPoint,
  PositionAgg,
} from "./types";

// ── Global market selector ──

interface MarketState {
  market: Market;
  setMarket: (m: Market) => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      market: "KRW",
      setMarket: (market) => set({ market }),
    }),
    { name: "market-store", storage: createJSONStorage(() => sessionStorage) }
  )
);

// ── 환경 모드 (Backtest / Live) ──

interface EnvState {
  env: "backtest" | "live";
  autoTrade: boolean;            // 서버가 정본, UI는 마지막 값 캐시
  setEnv: (e: "backtest" | "live") => void;
  setAutoTrade: (v: boolean) => void;
}

export const useEnvStore = create<EnvState>()(
  persist(
    (set) => ({
      env: "backtest",
      autoTrade: false,
      setEnv: (env) => set({ env }),
      setAutoTrade: (autoTrade) => set({ autoTrade }),
    }),
    { name: "env-store", storage: createJSONStorage(() => sessionStorage) }
  )
);

// ── Backtest Store ──

export interface BacktestResult {
  stats: BacktestStats;
  trades: TradeRecord[];
  equityData: EquityPoint[];
  yearlyData: YearlyRow[];
  positions: PositionAgg[];
}

interface BacktestState {
  taskId: string | null;
  loading: boolean;
  progressMsg: string;
  error: string | null;
  params: BacktestRequest | null;
  result: BacktestResult | null;

  setRunning: (taskId: string, params: BacktestRequest) => void;
  setProgress: (msg: string) => void;
  setComplete: (result: BacktestResult, taskId?: string) => void;
  setError: (error: string) => void;
  setResult: (result: BacktestResult, params: BacktestRequest) => void;
  cancel: () => void;
  reset: () => void;
}

export const useBacktestStore = create<BacktestState>()(
  persist(
    (set) => ({
      taskId: null,
      loading: false,
      progressMsg: "",
      error: null,
      params: null,
      result: null,

      setRunning: (taskId, params) =>
        set({ taskId, loading: true, progressMsg: "", error: null, params, result: null }),
      setProgress: (msg) => set({ progressMsg: msg }),
      setComplete: (result, taskId) => set({ loading: false, result, taskId: taskId ?? null }),
      setError: (error) => set({ loading: false, error, taskId: null }),
      setResult: (result, params) =>
        set({ result, params, loading: false, taskId: null, error: null }),
      cancel: () => set({ loading: false, taskId: null, progressMsg: "" }),
      reset: () =>
        set({ taskId: null, loading: false, progressMsg: "", error: null, params: null, result: null }),
    }),
    {
      name: "backtest-store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        taskId: state.taskId,
        loading: state.loading,
        params: state.params,
      }),
    }
  )
);
