import type { ExerciseCaseMetrics } from "./washi-runner.js";

export type PyodideRunPhase = "loading-pyodide" | "loading-highspy" | "running";

export interface PyodideExerciseRunResult {
  ok: boolean;
  logs: string[];
  outputs: unknown[];
  metrics: ExerciseCaseMetrics[];
  error?: string;
  wasCached: boolean;
  loadTimeMs: number;
  runTimeMs: number;
}

class LazyPyodideClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private loadedOnce = false;
  private pending: Map<
    number,
    {
      resolve: (res: PyodideExerciseRunResult) => void;
      onPhase?: (phase: PyodideRunPhase) => void;
      timerId: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./pyodide-worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
        const data = event.data;
        if (data.type === "phase") {
          const phase = data.phase as PyodideRunPhase;
          const reqId = typeof data.requestId === "number" ? data.requestId : undefined;
          if (reqId !== undefined) {
            this.pending.get(reqId)?.onPhase?.(phase);
          } else {
            for (const entry of this.pending.values()) {
              entry.onPhase?.(phase);
            }
          }
          return;
        }
        if (data.type === "result" && typeof data.requestId === "number") {
          const pendingEntry = this.pending.get(data.requestId);
          if (!pendingEntry) return;
          this.pending.delete(data.requestId);
          clearTimeout(pendingEntry.timerId);
          this.loadedOnce = this.loadedOnce || Boolean(data.ok) || Boolean(data.wasCached);
          pendingEntry.resolve({
            ok: Boolean(data.ok),
            logs: Array.isArray(data.logs) ? (data.logs as string[]) : [],
            outputs: Array.isArray(data.outputs) ? data.outputs : [],
            metrics: Array.isArray(data.metrics) ? (data.metrics as ExerciseCaseMetrics[]) : [],
            ...(typeof data.error === "string" ? { error: data.error } : {}),
            wasCached: Boolean(data.wasCached),
            loadTimeMs: typeof data.loadTimeMs === "number" ? data.loadTimeMs : 0,
            runTimeMs: typeof data.runTimeMs === "number" ? data.runTimeMs : 0,
          });
        }
      };
      this.worker.onerror = (ev: ErrorEvent) => {
        const message = ev.message || "Pyodide worker crashed unexpectedly.";
        this.failAllAndReset(message);
      };
    }
    return this.worker;
  }

  private failAllAndReset(message: string): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.loadedOnce = false;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timerId);
      entry.resolve({
        ok: false,
        logs: [],
        outputs: [],
        metrics: [],
        error: message,
        wasCached: false,
        loadTimeMs: 0,
        runTimeMs: 0,
      });
    }
    this.pending.clear();
  }

  run(
    code: string,
    inputs: unknown[],
    options: {
      onPhase?: (phase: PyodideRunPhase) => void;
      timeoutMs?: number;
    } = {}
  ): Promise<PyodideExerciseRunResult> {
    const worker = this.ensureWorker();
    const requestId = this.nextId++;
    // Allow extra budget on cold Pyodide + highspy CDN fetch, tighter afterwards
    const timeoutMs = options.timeoutMs ?? (this.loadedOnce ? 30_000 : 120_000);

    return new Promise((resolve) => {
      const timerId = setTimeout(() => {
        this.failAllAndReset(
          `Python (highspy) execution timed out after ${Math.round(timeoutMs / 1000)}s.`
        );
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        onPhase: options.onPhase,
        timerId,
      });

      worker.postMessage({
        requestId,
        code,
        inputsJson: JSON.stringify(inputs),
      });
    });
  }
}

const sharedPyodideClient = new LazyPyodideClient();

export function runHighspyExerciseCode(
  code: string,
  inputs: unknown[],
  options: {
    onPhase?: (phase: PyodideRunPhase) => void;
    timeoutMs?: number;
  } = {}
): Promise<PyodideExerciseRunResult> {
  return sharedPyodideClient.run(code, inputs, options);
}
