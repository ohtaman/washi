import type { SolveOptions } from "../../types.js";
import {
  solveLpWithHighs,
  type RawHighsSolveResult,
  resolveBrowserWasmUrl,
} from "./loader.js";
import { createHighsWorker } from "./worker-factory.js";

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
      workerInstance = createHighsWorker();
      const currentWorker = workerInstance;

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

      const failWorker = (error: Error) => {
        if (workerInstance !== currentWorker) return;
        workerInstance = null;
        currentWorker.terminate();
        for (const pending of pendingRequests.values()) pending.reject(error);
        pendingRequests.clear();
      };

      workerInstance.onerror = (e: any) =>
        failWorker(
          new Error(
            `[WaSHI] HiGHS Worker failed to load or execute. Check Worker assets, CORS and CSP. ${e?.message || ""}`
          )
        );
      workerInstance.onmessageerror = () =>
        failWorker(
          new Error("[WaSHI] Could not deserialize the HiGHS Worker response.")
        );
    } catch {
      workerInstance = null;
    }
  }

  return workerInstance;
}

/**
 * Solve an LP model using a Web Worker if supported and requested,
 * falling back to the main thread WASM solver otherwise.
 */
export async function solveLp(
  lpString: string,
  options: SolveOptions & { useWorker?: boolean } = {}
): Promise<{ result: RawHighsSolveResult; runTime: number }> {
  // Resolve before creating the worker so a fast load error cannot precede registration.
  const resolvedWasmUrl = await resolveBrowserWasmUrl(options.wasmUrl);
  const useWorker = options.useWorker ?? (typeof window !== "undefined");
  const worker = useWorker ? getWorker() : null;

  if (!worker) {
    return solveLpWithHighs(lpString, options);
  }

  const mergedOptions = {
    ...options,
    wasmUrl: resolvedWasmUrl,
  };

  const id = `req_${++reqIdCounter}`;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    try {
      worker.postMessage({
        type: "SOLVE",
        id,
        lpString,
        options: mergedOptions,
      });
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}
