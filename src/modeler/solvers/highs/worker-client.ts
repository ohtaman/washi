import type { SolveOptions, SolveProgressEvent } from "../../types.js";
import {
  getHighs,
  isHighsCached,
  solveLpWithHighs,
  type RawHighsSolveResult,
  type HighsIncumbentSnapshot,
  resolveBrowserWasmUrl,
} from "./loader.js";
import { createHighsWorker } from "./worker-factory.js";

interface PendingSolveRequest {
  kind: "SOLVE";
  id: string;
  lpString: string;
  workerOptions: Record<string, any>;
  wasmUrl: string;
  reportProgress: boolean;
  dispatched?: boolean;
  startTime: number;
  onProgress?: (progress: SolveProgressEvent) => void;
  lastProgress?: SolveProgressEvent;
  lastIncumbent?: HighsIncumbentSnapshot;
  cleanupAbort?: () => void;
  resolve: (res: { result: RawHighsSolveResult; runTime: number }) => void;
  reject: (err: any) => void;
}

interface PendingWarmupRequest {
  kind: "WARMUP";
  id: string;
  workerOptions: Record<string, any>;
  wasmUrl: string;
  dispatched?: boolean;
  cleanupAbort?: () => void;
  resolve: () => void;
  reject: (err: any) => void;
}

type PendingWorkerRequest = PendingSolveRequest | PendingWarmupRequest;

let workerInstance: Worker | null = null;
let warmedWorker: Worker | null = null;
let warmedWorkerWasmUrl: string | null = null;
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

function dispatchHeadRequestIfIdle(worker: Worker): void {
  const head = pendingRequests.values().next().value as PendingWorkerRequest | undefined;
  if (!head || head.dispatched) {
    return;
  }
  head.dispatched = true;
  try {
    if (head.kind === "WARMUP") {
      worker.postMessage({
        type: "WARMUP",
        id: head.id,
        options: head.workerOptions,
      });
    } else {
      worker.postMessage({
        type: "SOLVE",
        id: head.id,
        lpString: head.lpString,
        options: head.workerOptions,
        ...(head.reportProgress ? { reportProgress: true } : {}),
      });
    }
  } catch (err) {
    pendingRequests.delete(head.id);
    head.cleanupAbort?.();
    head.reject(err);
    dispatchHeadRequestIfIdle(worker);
  }
}

function terminateActiveWorkerAndRedispatch(): void {
  const currentWorker = workerInstance;
  if (currentWorker) {
    workerInstance = null;
    warmedWorker = null;
    warmedWorkerWasmUrl = null;
    currentWorker.terminate();
  }

  for (const other of pendingRequests.values()) {
    other.dispatched = false;
  }

  if (pendingRequests.size > 0) {
    const replacementWorker = getWorker();
    if (replacementWorker) {
      dispatchHeadRequestIfIdle(replacementWorker);
    } else {
      const recreateErr = new Error("[WaSHI] Failed to recreate HiGHS Worker after interruption.");
      for (const other of Array.from(pendingRequests.values())) {
        pendingRequests.delete(other.id);
        other.cleanupAbort?.();
        other.reject(recreateErr);
      }
    }
  }
}

function isBrowserWebWorkerAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    // z3-built.js assigns node:worker_threads.Worker onto global.Worker in Node.js;
    // avoid treating it as a browser Web Worker when window is polyfilled (e.g. jsdom/SSR).
    typeof (Worker as { prototype?: { unref?: unknown } })?.prototype?.unref !== "function"
  );
}

function getWorker(): Worker | null {
  if (!isBrowserWebWorkerAvailable()) {
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
          if (pending.kind === "SOLVE" && progress) {
            pending.lastProgress = progress;
            try {
              pending.onProgress?.(progress);
            } catch (callbackErr) {
              const stillPending = pendingRequests.get(id);
              if (stillPending) {
                const activeId = pendingRequests.keys().next().value;
                pendingRequests.delete(id);
                stillPending.cleanupAbort?.();
                if (activeId === id) {
                  terminateActiveWorkerAndRedispatch();
                }
                stillPending.reject(callbackErr);
              }
            }
          }
          return;
        }

        if (type === "SOLVE_INCUMBENT") {
          if (pending.kind === "SOLVE" && incumbent) {
            pending.lastIncumbent = incumbent;
          }
          return;
        }

        pendingRequests.delete(id);
        pending.cleanupAbort?.();
        if (pending.kind === "WARMUP") {
          if (type === "WARMUP_SUCCESS") {
            if (workerInstance === currentWorker) {
              warmedWorker = currentWorker;
              warmedWorkerWasmUrl = pending.wasmUrl;
            }
            pending.resolve();
          } else {
            pending.reject(new Error(error || "Worker warmup failed"));
          }
        } else if (type === "SOLVE_SUCCESS") {
          if (workerInstance === currentWorker) {
            warmedWorker = currentWorker;
            warmedWorkerWasmUrl = pending.wasmUrl;
          }
          pending.resolve({ result, runTime });
        } else {
          pending.reject(new Error(error || "Worker solve failed"));
        }
        if (workerInstance === currentWorker) {
          dispatchHeadRequestIfIdle(currentWorker);
        }
      };

      const failWorker = (error: Error) => {
        if (workerInstance !== currentWorker) return;
        workerInstance = null;
        warmedWorker = null;
        warmedWorkerWasmUrl = null;
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

function shouldUseWorker(options: SolveOptions & { useWorker?: boolean }): boolean {
  const effectiveOrigin =
    typeof window !== "undefined"
      ? typeof window.origin === "string"
        ? window.origin
        : window.location?.origin
      : undefined;
  return (
    options.useWorker ??
    (typeof window !== "undefined" &&
      effectiveOrigin !== "null" &&
      !effectiveOrigin?.startsWith("file:"))
  );
}

function sanitizeWorkerOptions(
  options: SolveOptions & { useWorker?: boolean },
  resolvedWasmUrl: string
): Record<string, any> {
  const { signal: _signal, onProgress: _onProgress, ...restOptions } = options;
  const workerOptions: Record<string, any> = {};
  for (const [k, v] of Object.entries(restOptions)) {
    if (typeof v !== "function") {
      workerOptions[k] = v;
    }
  }
  workerOptions.wasmUrl = resolvedWasmUrl;
  return workerOptions;
}

/**
 * Returns whether the target HiGHS runtime (active Web Worker or main thread)
 * is already warmed and ready without triggering worker creation or WASM loads.
 */
export async function isHighsWarmed(
  options: SolveOptions & { useWorker?: boolean } = {}
): Promise<boolean> {
  if (!shouldUseWorker(options) || !isBrowserWebWorkerAvailable()) {
    return isHighsCached(options);
  }
  if (!workerInstance || !warmedWorker || warmedWorker !== workerInstance) {
    return false;
  }
  const resolvedWasmUrl = await resolveBrowserWasmUrl(options.wasmUrl);
  return warmedWorkerWasmUrl === resolvedWasmUrl;
}

/**
 * Pre-initialize the HiGHS WebAssembly runtime (inside the active Web Worker when used,
 * or on the main thread otherwise) so subsequent solve calls avoid cold WASM loading latency.
 */
export async function warmupHighs(
  options: SolveOptions & { useWorker?: boolean } = {}
): Promise<{ cached: boolean }> {
  const resolvedWasmUrl = await resolveBrowserWasmUrl(options.wasmUrl);
  const worker = shouldUseWorker(options) ? getWorker() : null;

  if (!worker) {
    const cached = await isHighsCached(options);
    await getHighs(options);
    return { cached };
  }

  if (warmedWorker === worker && warmedWorkerWasmUrl === resolvedWasmUrl) {
    return { cached: true };
  }

  const workerOptions = sanitizeWorkerOptions(options, resolvedWasmUrl);
  const id = `req_${++reqIdCounter}`;

  await new Promise<void>((resolve, reject) => {
    const entry: PendingWarmupRequest = {
      kind: "WARMUP",
      id,
      workerOptions,
      wasmUrl: resolvedWasmUrl,
      resolve,
      reject,
    };
    pendingRequests.set(id, entry);
    dispatchHeadRequestIfIdle(worker);
  });

  return { cached: false };
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

  const worker = shouldUseWorker(options) ? getWorker() : null;

  if (!worker) {
    return solveLpWithHighs(lpString, options);
  }

  const { signal, onProgress } = options;
  const workerOptions = sanitizeWorkerOptions(options, resolvedWasmUrl);
  const reportProgress = Boolean(onProgress || signal);

  const id = `req_${++reqIdCounter}`;
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const entry: PendingSolveRequest = {
      kind: "SOLVE",
      id,
      lpString,
      workerOptions,
      wasmUrl: resolvedWasmUrl,
      reportProgress,
      startTime,
      onProgress,
      resolve,
      reject,
    };

    if (signal) {
      const onAbort = () => {
        const pending = pendingRequests.get(id);
        if (!pending || pending.kind !== "SOLVE") return;
        const activeId = pendingRequests.keys().next().value;
        pendingRequests.delete(id);
        pending.cleanupAbort?.();

        if (activeId === id) {
          terminateActiveWorkerAndRedispatch();
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
    dispatchHeadRequestIfIdle(worker);
  });
}
