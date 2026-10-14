import type { SolveOptions, SolveProgressEvent } from "../../types.js";
import {
  solveLpWithHighs,
  type RawHighsSolveResult,
  type HighsIncumbentSnapshot,
  resolveBrowserWasmUrl,
} from "./loader.js";
import { createHighsWorker } from "./worker-factory.js";

interface PendingWorkerRequest {
  id: string;
  lpString: string;
  workerOptions: Record<string, any>;
  reportProgress: boolean;
  startTime: number;
  onProgress?: (progress: SolveProgressEvent) => void;
  lastProgress?: SolveProgressEvent;
  lastIncumbent?: HighsIncumbentSnapshot;
  cleanupAbort?: () => void;
  resolve: (res: { result: RawHighsSolveResult; runTime: number }) => void;
  reject: (err: any) => void;
}

let workerInstance: Worker | null = null;
let reqIdCounter = 0;
const pendingRequests = new Map<string, PendingWorkerRequest>();

function createInterruptedRawResult(
  inc?: HighsIncumbentSnapshot,
  prog?: SolveProgressEvent
): RawHighsSolveResult {
  if (inc) {
    return {
      Status: "Interrupted",
      StatusCode: 17,
      HasPrimalSolution: true,
      IsMip: true,
      ObjectiveValue: inc.objectiveValue,
      ObjectiveOffsetApplied: true,
      ...(prog?.objectiveBound !== undefined
        ? { MipDualBound: prog.objectiveBound }
        : inc.mipDualBound !== undefined
          ? { MipDualBound: inc.mipDualBound }
          : {}),
      ...(prog?.relGap !== undefined
        ? { MipGap: prog.relGap }
        : inc.mipGap !== undefined
          ? { MipGap: inc.mipGap }
          : {}),
      Columns: inc.columns,
      Rows: [],
    };
  }
  return {
    Status: "Interrupted",
    StatusCode: 17,
    HasPrimalSolution: false,
    ObjectiveValue: NaN,
    ObjectiveOffsetApplied: true,
    ...(prog?.objectiveBound !== undefined ? { MipDualBound: prog.objectiveBound } : {}),
    ...(prog?.relGap !== undefined ? { MipGap: prog.relGap } : {}),
    Columns: {},
    Rows: [],
  };
}

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (!workerInstance) {
    try {
      workerInstance = createHighsWorker();
      const currentWorker = workerInstance;

      workerInstance.onmessage = (e: MessageEvent) => {
        const { type, id, result, runTime, error, progress, incumbent } = e.data;
        const pending = pendingRequests.get(id);
        if (!pending) {
          return;
        }

        if (type === "SOLVE_PROGRESS") {
          if (progress) {
            pending.lastProgress = progress;
            pending.onProgress?.(progress);
          }
          return;
        }

        if (type === "SOLVE_INCUMBENT") {
          if (incumbent) {
            pending.lastIncumbent = incumbent;
          }
          return;
        }

        pendingRequests.delete(id);
        pending.cleanupAbort?.();
        if (type === "SOLVE_SUCCESS") {
          pending.resolve({ result, runTime });
        } else {
          pending.reject(new Error(error || "Worker solve failed"));
        }
      };

      const failWorker = (error: Error) => {
        if (workerInstance !== currentWorker) return;
        workerInstance = null;
        currentWorker.terminate();
        for (const pending of pendingRequests.values()) {
          pending.cleanupAbort?.();
          pending.reject(error);
        }
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
  if (options.signal?.aborted) {
    return {
      result: createInterruptedRawResult(),
      runTime: 0,
    };
  }

  // Resolve before creating the worker so a fast load error cannot precede registration.
  const resolvedWasmUrl = await resolveBrowserWasmUrl(options.wasmUrl);
  if (options.signal?.aborted) {
    return {
      result: createInterruptedRawResult(),
      runTime: 0,
    };
  }

  const useWorker = options.useWorker ?? (typeof window !== "undefined");
  const worker = useWorker ? getWorker() : null;

  if (!worker) {
    return solveLpWithHighs(lpString, options);
  }

  const { signal, onProgress, ...restOptions } = options;
  const workerOptions: Record<string, any> = {};
  for (const [k, v] of Object.entries(restOptions)) {
    if (typeof v !== "function") {
      workerOptions[k] = v;
    }
  }
  workerOptions.wasmUrl = resolvedWasmUrl;
  const reportProgress = Boolean(onProgress || signal);

  const id = `req_${++reqIdCounter}`;
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const entry: PendingWorkerRequest = {
      id,
      lpString,
      workerOptions,
      reportProgress,
      startTime,
      onProgress,
      resolve,
      reject,
    };

    if (signal) {
      const onAbort = () => {
        const pending = pendingRequests.get(id);
        if (!pending) return;
        const activeId = pendingRequests.keys().next().value;
        pendingRequests.delete(id);
        pending.cleanupAbort?.();

        if (activeId === id) {
          const currentWorker = workerInstance;
          if (currentWorker) {
            workerInstance = null;
            currentWorker.terminate();
          }

          if (pendingRequests.size > 0) {
            const replacementWorker = getWorker();
            if (replacementWorker) {
              for (const other of Array.from(pendingRequests.values())) {
                try {
                  replacementWorker.postMessage({
                    type: "SOLVE",
                    id: other.id,
                    lpString: other.lpString,
                    options: other.workerOptions,
                    ...(other.reportProgress ? { reportProgress: true } : {}),
                  });
                } catch (err) {
                  pendingRequests.delete(other.id);
                  other.cleanupAbort?.();
                  other.reject(err);
                }
              }
            }
          }
        }

        const elapsed = (performance.now() - pending.startTime) / 1000;
        pending.resolve({
          result: createInterruptedRawResult(pending.lastIncumbent, pending.lastProgress),
          runTime: elapsed,
        });
      };

      signal.addEventListener("abort", onAbort, { once: true });
      entry.cleanupAbort = () => signal.removeEventListener("abort", onAbort);
    }

    pendingRequests.set(id, entry);
    try {
      worker.postMessage({
        type: "SOLVE",
        id,
        lpString,
        options: workerOptions,
        ...(reportProgress ? { reportProgress: true } : {}),
      });
    } catch (error) {
      pendingRequests.delete(id);
      entry.cleanupAbort?.();
      reject(error);
    }
  });
}
