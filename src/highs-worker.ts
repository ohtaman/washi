import { solveLpWithHighs } from "./highs-loader.js";

// Web Worker entry point for non-blocking solver execution
self.onmessage = async (e: MessageEvent) => {
  const { type, id, lpString, options } = e.data;

  if (type === "SOLVE") {
    try {
      const { result, runTime } = await solveLpWithHighs(lpString, options);
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
