import type { SolveOptions } from "./modeler/types.js";
import { solveLpWithHighs, type RawHighsSolveResult, getHighsWasmUrl } from "./highs-loader.js";

let workerInstance: Worker | null = null;
let reqIdCounter = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (res: { result: RawHighsSolveResult; runTime: number }) => void;
    reject: (err: any) => void;
  }
>();

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL("./highs-worker.ts", import.meta.url), {
        type: "module",
      });

      workerInstance.onmessage = (e: MessageEvent) => {
        const { type, id, result, runTime, error } = e.data;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          if (type === "SOLVE_SUCCESS") {
            pending.resolve({ result, runTime });
          } else {
            pending.reject(new Error(error || "Worker solve failed"));
          }
        }
      };

      workerInstance.onerror = (e) => {
        console.error("HiGHS Web Worker error:", e);
      };
    } catch (e) {
      console.warn("Could not instantiate Web Worker, falling back to main thread:", e);
      workerInstance = null;
    }
  }

  return workerInstance;
}

/**
 * Solve an LP model either in a background Web Worker or on the current thread
 */
export async function solveLp(
  lpString: string,
  options: SolveOptions & { useWorker?: boolean } = {}
): Promise<{ result: RawHighsSolveResult; runTime: number }> {
  const useWorker = options.useWorker ?? (typeof window !== "undefined");
  const worker = useWorker ? getWorker() : null;

  if (!worker) {
    // Solve on current thread (Node.js or browser main thread)
    return solveLpWithHighs(lpString, options);
  }

  const resolvedWasmUrl =
    options.wasmUrl ||
    getHighsWasmUrl() ||
    (typeof window !== "undefined"
      ? new URL("highs.wasm", window.location.href).href
      : undefined);

  const mergedOptions = {
    ...options,
    ...(resolvedWasmUrl ? { wasmUrl: resolvedWasmUrl } : {}),
  };

  const id = `req_${++reqIdCounter}`;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({
      type: "SOLVE",
      id,
      lpString,
      options: mergedOptions,
    });
  });
}
