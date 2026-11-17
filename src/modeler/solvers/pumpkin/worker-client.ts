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

interface BaseQueuedTask {
  id: number;
  requestJson: string;
  wasmUrl: string | null;
  signal?: AbortSignal;
  startTimeMs: number;
  lastIncumbent: PumpkinIncumbentMessagePayload | null;
  reject: (reason: unknown) => void;
  cleanupAbort?: () => void;
}

interface CheckQueuedTask extends BaseQueuedTask {
  type: "check";
  resolve: (value: PumpkinCheckResponsePayload) => void;
}

interface SolveQueuedTask extends BaseQueuedTask {
  type: "solve";
  onProgress?: (event: SolveProgressEvent) => void;
  resolve: (value: PumpkinSolveResponsePayload) => void;
}

type QueuedTask = CheckQueuedTask | SolveQueuedTask;

type PumpkinWorkerIncomingMessage =
  | {
      id: number;
      type: "SOLVE_PROGRESS";
      payloadJson?: string;
      incumbent?: PumpkinIncumbentMessagePayload;
      elapsedTime?: number;
    }
  | {
      id: number;
      type: "CHECK_SUCCESS";
      responseJson?: string;
      result?: PumpkinCheckResponsePayload;
      runTime?: number;
    }
  | {
      id: number;
      type: "SOLVE_SUCCESS";
      responseJson?: string;
      result?: PumpkinSolveResponsePayload;
      runTime?: number;
    }
  | {
      id: number;
      type: "SOLVER_ERROR";
      error?: string;
    };

function buildAbortedCheckResult(startTimeMs: number): PumpkinCheckResponsePayload {
  return {
    status: "Unknown",
    values: [],
    boolValues: [],
    runTime: Math.max((performance.now() - startTimeMs) / 1000, 1e-6),
  };
}

function buildAbortedSolveResult(
  startTimeMs: number,
  incumbent: PumpkinIncumbentMessagePayload | null
): PumpkinSolveResponsePayload {
  const runTime = Math.max((performance.now() - startTimeMs) / 1000, 1e-6);
  if (incumbent) {
    return {
      status: "Feasible",
      terminationStatus: "Interrupted",
      objectiveValue: incumbent.objectiveValue,
      values: incumbent.values,
      boolValues: incumbent.boolValues,
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

  const detachTask = (task: QueuedTask) => {
    if (activeTask === task) {
      activeTask = null;
    }
    task.cleanupAbort?.();
  };

  const settleCheck = (task: CheckQueuedTask, value: PumpkinCheckResponsePayload) => {
    detachTask(task);
    task.resolve(value);
    pumpQueue();
  };

  const settleSolve = (task: SolveQueuedTask, value: PumpkinSolveResponsePayload) => {
    detachTask(task);
    task.resolve(value);
    pumpQueue();
  };

  const rejectTask = (task: QueuedTask, reason: unknown) => {
    detachTask(task);
    task.reject(reason);
    pumpQueue();
  };

  const resolveAbortedTask = (task: QueuedTask) => {
    if (task.type === "check") {
      settleCheck(task, buildAbortedCheckResult(task.startTimeMs));
    } else {
      settleSolve(task, buildAbortedSolveResult(task.startTimeMs, task.lastIncumbent));
    }
  };

  const parseSuccessPayload = <T extends PumpkinCheckResponsePayload | PumpkinSolveResponsePayload>(
    responseJson: string | undefined,
    fallbackResult: T | undefined,
    rawRunTime: number | undefined,
    startTimeMs: number
  ): T => {
    const payload =
      typeof responseJson === "string" ? (JSON.parse(responseJson) as T) : fallbackResult;
    if (!payload) {
      throw new Error("Pumpkin worker returned an empty success payload.");
    }
    if (payload.error) {
      throw new Error(payload.error);
    }
    return {
      ...payload,
      runTime:
        typeof rawRunTime === "number"
          ? rawRunTime
          : Math.max((performance.now() - startTimeMs) / 1000, 1e-6),
    };
  };

  const ensureWorker = (): Worker => {
    if (worker) {
      return worker;
    }
    const w = createWorker();
    w.onmessage = (event: MessageEvent<PumpkinWorkerIncomingMessage>) => {
      const data = event.data;
      const task = activeTask;
      if (worker !== w || !data || !task || data.id !== task.id) {
        return;
      }

      if (data.type === "SOLVE_PROGRESS") {
        if (task.type !== "solve") {
          return;
        }
        try {
          const parsed =
            typeof data.payloadJson === "string"
              ? (JSON.parse(data.payloadJson) as PumpkinIncumbentMessagePayload)
              : data.incumbent;
          if (!parsed) {
            return;
          }
          task.lastIncumbent = parsed;

          if (task.onProgress) {
            const elapsedTime =
              typeof data.elapsedTime === "number"
                ? data.elapsedTime
                : Math.max((performance.now() - task.startTimeMs) / 1000, 1e-6);
            task.onProgress({
              elapsedTime,
              elapsedSeconds: elapsedTime,
              objectiveValue: parsed.objectiveValue,
            });
          }

          if (worker !== w || activeTask !== task) {
            return;
          }

          if (task.signal?.aborted) {
            terminateWorker();
            resolveAbortedTask(task);
          }
        } catch (cbErr) {
          if (worker === w && activeTask === task) {
            terminateWorker();
            rejectTask(task, cbErr);
          }
        }
        return;
      }

      if (data.type === "CHECK_SUCCESS") {
        if (task.type !== "check") {
          terminateWorker();
          rejectTask(task, new Error('Received "CHECK_SUCCESS" for a solve task.'));
          return;
        }
        try {
          const payload = parseSuccessPayload<PumpkinCheckResponsePayload>(
            data.responseJson,
            data.result,
            data.runTime,
            task.startTimeMs
          );
          settleCheck(task, payload);
        } catch (parseErr) {
          if (worker === w && activeTask === task) {
            terminateWorker();
            rejectTask(task, parseErr);
          }
        }
        return;
      }

      if (data.type === "SOLVE_SUCCESS") {
        if (task.type !== "solve") {
          terminateWorker();
          rejectTask(task, new Error('Received "SOLVE_SUCCESS" for a check task.'));
          return;
        }
        try {
          const payload = parseSuccessPayload<PumpkinSolveResponsePayload>(
            data.responseJson,
            data.result,
            data.runTime,
            task.startTimeMs
          );
          settleSolve(task, payload);
        } catch (parseErr) {
          if (worker === w && activeTask === task) {
            terminateWorker();
            rejectTask(task, parseErr);
          }
        }
        return;
      }

      if (data.type === "SOLVER_ERROR") {
        const message =
          typeof data.error === "string" ? data.error : "Pumpkin worker execution failed.";
        rejectTask(task, new Error(message));
      }
    };

    w.onerror = (err: ErrorEvent) => {
      if (worker !== w) {
        return;
      }
      const task = activeTask;
      terminateWorker();
      if (task) {
        const message = err?.message || "Pumpkin Web Worker encountered an unexpected error.";
        rejectTask(task, new Error(message));
      }
    };

    w.onmessageerror = () => {
      if (worker !== w) {
        return;
      }
      const task = activeTask;
      terminateWorker();
      if (task) {
        rejectTask(task, new Error("Failed to deserialize message from Pumpkin Web Worker."));
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
        if (next.type === "check") {
          next.resolve(buildAbortedCheckResult(next.startTimeMs));
        } else {
          next.resolve(buildAbortedSolveResult(next.startTimeMs, next.lastIncumbent));
        }
        continue;
      }

      activeTask = next;
      next.startTimeMs = performance.now();

      if (next.signal) {
        const onAbort = () => {
          if (activeTask !== next) {
            return;
          }
          terminateWorker();
          resolveAbortedTask(next);
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
        if (activeTask === next) {
          terminateWorker();
          rejectTask(next, err);
        }
      }
      return;
    }
  };

  const resolveWasmUrl = (paramUrl?: string | null): string | null =>
    paramUrl !== undefined
      ? paramUrl
      : clientOptions.wasmUrl !== undefined
        ? clientOptions.wasmUrl
        : getPumpkinWasmUrl();

  const enqueueTask = <T>(
    buildTask: (resolve: (value: T) => void, reject: (reason: unknown) => void) => QueuedTask
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(buildTask(resolve, reject));
      pumpQueue();
    });

  return {
    check(params, options) {
      if (disposed) {
        return Promise.reject(new Error("[WaSHI] Pumpkin worker client has been disposed."));
      }
      if (options?.signal?.aborted) {
        return Promise.resolve(buildAbortedCheckResult(performance.now()));
      }
      const wasmUrl = resolveWasmUrl(params.wasmUrl);
      return enqueueTask<PumpkinCheckResponsePayload>((resolve, reject) => ({
        id: nextRequestId++,
        type: "check",
        requestJson: params.requestJson,
        wasmUrl,
        signal: options?.signal,
        startTimeMs: performance.now(),
        lastIncumbent: null,
        resolve,
        reject,
      }));
    },
    solve(params, options) {
      if (disposed) {
        return Promise.reject(new Error("[WaSHI] Pumpkin worker client has been disposed."));
      }
      if (options?.signal?.aborted) {
        return Promise.resolve(buildAbortedSolveResult(performance.now(), null));
      }
      const wasmUrl = resolveWasmUrl(params.wasmUrl);
      return enqueueTask<PumpkinSolveResponsePayload>((resolve, reject) => ({
        id: nextRequestId++,
        type: "solve",
        requestJson: params.requestJson,
        wasmUrl,
        signal: options?.signal,
        onProgress: options?.onProgress,
        startTimeMs: performance.now(),
        lastIncumbent: null,
        resolve,
        reject,
      }));
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
