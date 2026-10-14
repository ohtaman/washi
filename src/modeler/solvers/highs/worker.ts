import { solveLpWithHighs, type HighsIncumbentSnapshot } from "./loader.js";
import type { SolveProgressEvent } from "../../types.js";

// Web Worker entry point for non-blocking solver execution
self.onmessage = async (e: MessageEvent) => {
  const { type, id, lpString, options, reportProgress } = e.data;

  if (type === "SOLVE") {
    try {
      const { result, runTime } = await solveLpWithHighs(lpString, {
        ...options,
        ...(reportProgress
          ? {
              onProgress: (progress: SolveProgressEvent) => {
                self.postMessage({
                  type: "SOLVE_PROGRESS",
                  id,
                  progress,
                });
              },
              onIncumbent: (incumbent: HighsIncumbentSnapshot) => {
                self.postMessage({
                  type: "SOLVE_INCUMBENT",
                  id,
                  incumbent,
                });
              },
            }
          : {}),
      });
      self.postMessage({
        type: "SOLVE_SUCCESS",
        id,
        result,
        runTime,
      });
    } catch (err: any) {
      self.postMessage({
        type: "SOLVE_ERROR",
        id,
        error: err?.message || String(err),
      });
    }
  }
};
