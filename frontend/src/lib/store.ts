import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  PortfolioRequest,
  PortfolioResult,
} from "./types";

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
  setComplete: (result: PortfolioResult) => void;
  setError: (error: string) => void;
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

      setComplete: (result) =>
        set({ loading: false, result, taskId: null }),

      setError: (error) =>
        set({ loading: false, error, taskId: null }),

      cancel: () =>
        set({ loading: false, taskId: null, progressMsg: "" }),

      reset: () =>
        set({ taskId: null, loading: false, progressMsg: "", error: null, params: null, result: null }),
    }),
    {
      name: "portfolio-store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        taskId: state.taskId,
        loading: state.loading,
        params: state.params,
        result: state.result,
      }),
    }
  )
);
