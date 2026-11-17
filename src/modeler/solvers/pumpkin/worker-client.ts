import {
  getPumpkinWasmUrl,
  registerPumpkinWorkerResetHook,
} from "./loader.js";
import type { SolveProgressEvent } from "../../types.js";
import { createPumpkinWorker } from "./worker-factory.js";

export interface PumpkinCheckResponsePayload {
  status: "Sat" | "Unsat" | "Unknown";
  values?: Array<[string, number]>;
  boolValues?: Array<[string, boolean]>;
  unsatCore?: string[];
  error?: string;
  runTime?: number;
}

export interface PumpkinSolveResponsePayload {
  status: "Optimal" | "Feasible" | "Infeasible" | "TimeLimit" | "Unknown";
  terminationStatus: string;
  objectiveValue?: number | null;
  values?: Array<[string, number]>;
  boolValues?: Array<[string, boolean]>;
  error?: string;
  runTime?: number;
}

export interface PumpkinIncumbentMessagePayload {
  objectiveValue: number;
  values: Array<[string, number]>;
  boolValues: Array<[string, boolean]>;
}

export interface PumpkinWorkerClientOptions {
  workerFactory?: () => Worker;
  wasmUrl?: string | null;
  workerUrl?: string;
}

export interface PumpkinWorkerSolveOptions {
  signal?: AbortSignal;
  onProgress?: (event: SolveProgressEvent) => void;
}

export interface PumpkinWorkerCheckOptions {
  signal?: AbortSignal;
}

export interface PumpkinWorkerClient {
  check(
    params: { requestJson: string; wasmUrl?: string | null },
    options?: PumpkinWorkerCheckOptions
  ): Promise<PumpkinCheckResponsePayload>;
  solve(
    params: { requestJson: string; wasmUrl?: string | null },
    options?: PumpkinWorkerSolveOptions
  ): Promise<PumpkinSolveResponsePayload>;
  dispose(): void;
}

interface QueuedTask {
  id: number;
  type: "check" | "solve";
  requestJson: string;
  wasmUrl: string | null;
  signal?: AbortSignal;
  onProgress?: (event: SolveProgressEvent) => void;
  startTimeMs: number;
  lastIncumbent: PumpkinIncumbentMessagePayload | null;
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  cleanupAbort?: () => void;
}

/**
 * Creates a serialized Web Worker client for non-blocking Pumpkin execution.
 * On mid-solve abort or progress callback exceptions, immediately terminates and replaces
 * the Worker so subsequent queued requests run on a clean instance.
 */
export function createPumpkinWorkerClient(
  clientOptions: PumpkinWorkerClientOptions = {}
): PumpkinWorkerClient {
  const createWorker = clientOptions.workerFactory ?? createPumpkinWorker;
  let worker: Worker | null = null;
  let nextRequestId = 1;
  let activeTask: QueuedTask | null = null;
  const queue: QueuedTask[] = [];
  let disposed = false;

  const terminateWorker = () => {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  };

  const buildAbortedResult = (task: QueuedTask): PumpkinCheckResponsePayload | PumpkinSolveResponsePayload => {
    const runTime = Math.max((performance.now() - task.startTimeMs) / 1000, 1e-6);
    if (task.type === "check") {
      return {
        status: "Unknown",
        values: [],
        boolValues: [],
        runTime,
      };
    }
    if (task.lastIncumbent) {
      return {
        status: "Feasible",
        terminationStatus: "Interrupted",
        objectiveValue: task.lastIncumbent.objectiveValue,
        values: task.lastIncumbent.values,
        boolValues: task.lastIncumbent.boolValues,
        runTime,
      };
    }
    return {
      status: "Unknown",
      terminationStatus: "Interrupted",
      objectiveValue: null,
      values: [],
      boolValues: [],
      runTime,
    };
  };

  const finishActive = (outcome: { kind: "resolve"; value: any } | { kind: "reject"; reason: unknown }) => {
    const task = activeTask;
    activeTask = null;
    if (task) {
      task.cleanupAbort?.();
      if (outcome.kind === "resolve") {
        task.resolve(outcome.value);
      } else {
        task.reject(outcome.reason);
      }
    }
    pumpQueue();
  };

  const ensureWorker = (): Worker => {
    if (worker) {
      return worker;
    }
    const w = createWorker();
    w.onmessage = (event: MessageEvent<Record<string, any>>) => {
      const data = event.data;
      if (!data || !activeTask || data.id !== activeTask.id) {
        return;
      }

      if (data.type === "SOLVE_PROGRESS") {
        try {
          const parsed =
            typeof data.payloadJson === "string"
              ? (JSON.parse(data.payloadJson) as PumpkinIncumbentMessagePayload)
              : (data.incumbent as PumpkinIncumbentMessagePayload);
          activeTask.lastIncumbent = parsed;

          if (activeTask.onProgress) {
            const elapsedTime =
              typeof data.elapsedTime === "number"
                ? data.elapsedTime
                : Math.max((performance.now() - activeTask.startTimeMs) / 1000, 1e-6);
            activeTask.onProgress({
              elapsedTime,
              elapsedSeconds: elapsedTime,
              objectiveValue: parsed.objectiveValue,
            });
          }

          if (activeTask.signal?.aborted) {
            const interrupted = buildAbortedResult(activeTask);
            terminateWorker();
            finishActive({ kind: "resolve", value: interrupted });
          }
        } catch (cbErr) {
          terminateWorker();
          finishActive({ kind: "reject", reason: cbErr });
        }
        return;
      }

      if (data.type === "CHECK_SUCCESS" || data.type === "SOLVE_SUCCESS") {
        try {
          const payload =
            typeof data.responseJson === "string" ? JSON.parse(data.responseJson) : data.result;
          if (payload?.error) {
            finishActive({ kind: "reject", reason: new Error(payload.error) });
            return;
          }
          finishActive({
            kind: "resolve",
            value: {
              ...payload,
              runTime:
                typeof data.runTime === "number"
                  ? data.runTime
                  : Math.max((performance.now() - activeTask.startTimeMs) / 1000, 1e-6),
            },
          });
        } catch (parseErr) {
          terminateWorker();
          finishActive({ kind: "reject", reason: parseErr });
        }
        return;
      }

      if (data.type === "SOLVER_ERROR") {
        const message =
          typeof data.error === "string" ? data.error : "Pumpkin worker execution failed.";
        finishActive({ kind: "reject", reason: new Error(message) });
      }
    };

    w.onerror = (err: ErrorEvent) => {
      terminateWorker();
      if (activeTask) {
        const message = err?.message || "Pumpkin Web Worker encountered an unexpected error.";
        finishActive({ kind: "reject", reason: new Error(message) });
      }
    };

    w.onmessageerror = () => {
      terminateWorker();
      if (activeTask) {
        finishActive({
          kind: "reject",
          reason: new Error("Failed to deserialize message from Pumpkin Web Worker."),
        });
      }
    };

    worker = w;
    return w;
  };

  const pumpQueue = () => {
    if (activeTask || disposed) {
      return;
    }
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (next.signal?.aborted) {
        next.resolve(buildAbortedResult(next));
        continue;
      }

      activeTask = next;
      next.startTimeMs = performance.now();

      if (next.signal) {
        const onAbort = () => {
          if (activeTask !== next) {
            return;
          }
          const interrupted = buildAbortedResult(next);
          terminateWorker();
          finishActive({ kind: "resolve", value: interrupted });
        };
        next.signal.addEventListener("abort", onAbort, { once: true });
        next.cleanupAbort = () => next.signal?.removeEventListener("abort", onAbort);
      }

      try {
        const w = ensureWorker();
        w.postMessage({
          id: next.id,
          type: next.type,
          requestJson: next.requestJson,
          wasmUrl: next.wasmUrl,
        });
      } catch (err) {
        terminateWorker();
        finishActive({ kind: "reject", reason: err });
      }
      return;
    }
  };

  const enqueue = <T>(
    type: "check" | "solve",
    requestJson: string,
    wasmUrl: string | null,
    options?: PumpkinWorkerSolveOptions
  ): Promise<T> => {
    if (disposed) {
      return Promise.reject(new Error("[WaSHI] Pumpkin worker client has been disposed."));
    }
    if (options?.signal?.aborted) {
      const immediateTask: QueuedTask = {
        id: 0,
        type,
        requestJson,
        wasmUrl,
        signal: options.signal,
        startTimeMs: performance.now(),
        lastIncumbent: null,
        resolve: () => {},
        reject: () => {},
      };
      return Promise.resolve(buildAbortedResult(immediateTask) as T);
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask = {
        id: nextRequestId++,
        type,
        requestJson,
        wasmUrl,
        signal: options?.signal,
        onProgress: options?.onProgress,
        startTimeMs: performance.now(),
        lastIncumbent: null,
        resolve,
        reject,
      };
      queue.push(task);
      pumpQueue();
    });
  };

  return {
    check(params, options) {
      const effectiveWasmUrl =
        params.wasmUrl !== undefined
          ? params.wasmUrl
          : clientOptions.wasmUrl !== undefined
            ? clientOptions.wasmUrl
            : getPumpkinWasmUrl();
      return enqueue<PumpkinCheckResponsePayload>(
        "check",
        params.requestJson,
        effectiveWasmUrl,
        options
      );
    },
    solve(params, options) {
      const effectiveWasmUrl =
        params.wasmUrl !== undefined
          ? params.wasmUrl
          : clientOptions.wasmUrl !== undefined
            ? clientOptions.wasmUrl
            : getPumpkinWasmUrl();
      return enqueue<PumpkinSolveResponsePayload>(
        "solve",
        params.requestJson,
        effectiveWasmUrl,
        options
      );
    },
    dispose() {
      disposed = true;
      terminateWorker();
      while (queue.length > 0) {
        const queued = queue.shift()!;
        queued.cleanupAbort?.();
        queued.reject(new Error("[WaSHI] Pumpkin worker client disposed."));
      }
      if (activeTask) {
        const current = activeTask;
        activeTask = null;
        current.cleanupAbort?.();
        current.reject(new Error("[WaSHI] Pumpkin worker client disposed."));
      }
    },
  };
}

let sharedWorkerClient: PumpkinWorkerClient | null = null;

export function getSharedPumpkinWorkerClient(): PumpkinWorkerClient {
  if (!sharedWorkerClient) {
    sharedWorkerClient = createPumpkinWorkerClient();
    registerPumpkinWorkerResetHook(() => {
      if (sharedWorkerClient) {
        sharedWorkerClient.dispose();
        sharedWorkerClient = null;
      }
    });
  }
  return sharedWorkerClient;
}

export function disposeSharedPumpkinWorkerClient(): void {
  if (sharedWorkerClient) {
    sharedWorkerClient.dispose();
    sharedWorkerClient = null;
  }
}
