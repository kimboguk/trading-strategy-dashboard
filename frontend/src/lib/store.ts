import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  BacktestRequest,
  BacktestStats,
  TradeRecord,
  YearlyRow,
  ChartData,
  EquityPoint,
  PortfolioRequest,
  PortfolioResult,
} from "./types";

// ── Backtest Store ──

export interface BacktestResult {
  stats: BacktestStats;
  trades: TradeRecord[];
  chartData: ChartData | null;
  equityData: EquityPoint[];
  yearlyData: YearlyRow[];
}

interface BacktestState {
  // Running task
  taskId: string | null;
  loading: boolean;
  progressMsg: string;
  error: string | null;
  params: BacktestRequest | null;

  // Result
  result: BacktestResult | null;

  // Actions
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

      setComplete: (result, taskId) =>
        set({ loading: false, result, taskId: taskId ?? null }),

      setError: (error) =>
        set({ loading: false, error, taskId: null }),

      setResult: (result, params) =>
        set({ result, params, loading: false, taskId: null, error: null }),

      cancel: () =>
        set({ loading: false, taskId: null, progressMsg: "" }),

      reset: () =>
        set({ taskId: null, loading: false, progressMsg: "", error: null, params: null, result: null }),
    }),
    {
      name: "backtest-store",
      storage: createJSONStorage(() => sessionStorage),
      // Exclude result from persistence to avoid sessionStorage quota issues
      partialize: (state) => ({
        taskId: state.taskId,
        loading: state.loading,
        params: state.params,
      }),
    }
  )
);

// ── Portfolio Store ──

interface PortfolioState {
  // Running task
  taskId: string | null;
  loading: boolean;
  progressMsg: string;
  error: string | null;
  params: PortfolioRequest | null;

  // Result
  result: PortfolioResult | null;

  // Actions
  setRunning: (taskId: string, params: PortfolioRequest) => void;
  setProgress: (msg: string) => void;
  setComplete: (result: PortfolioResult, taskId?: string) => void;
  setError: (error: string) => void;
  setResult: (result: PortfolioResult, params: PortfolioRequest) => void;
  viewHistory: (result: PortfolioResult, params: PortfolioRequest) => void;
  cancel: () => void;
  reset: () => void;
}

export const usePortfolioStore = create<PortfolioState>()(
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

      setComplete: (result, taskId) =>
        set({ loading: false, result, taskId: taskId ?? null }),

      setError: (error) =>
        set({ loading: false, error, taskId: null }),

      setResult: (result, params) =>
        set({ result, params, loading: false, taskId: null, error: null }),

      viewHistory: (result, params) =>
        set({ result, params, loading: false, error: null, taskId: null }),

      cancel: () =>
        set({ loading: false, taskId: null, progressMsg: "" }),

      reset: () =>
        set({ taskId: null, loading: false, progressMsg: "", error: null, params: null, result: null }),
    }),
    {
      name: "portfolio-store",
      storage: createJSONStorage(() => sessionStorage),
      // Exclude result from persistence — it can be huge (trades, equity)
      // and exceeds sessionStorage quota. Keep taskId so we can re-fetch.
      partialize: (state) => ({
        taskId: state.taskId,
        loading: state.loading,
        params: state.params,
      }),
    }
  )
);
