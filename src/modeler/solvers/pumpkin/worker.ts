import { loadPumpkinRuntime } from "./loader.js";

export interface PumpkinWorkerRequest {
  id: number;
  type: "check" | "solve";
  requestJson: string;
  wasmUrl?: string | null;
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PumpkinWorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = async (event: MessageEvent<PumpkinWorkerRequest>) => {
  const { id, type, requestJson, wasmUrl } = event.data;
  try {
    const normalizedUrl = wasmUrl === undefined ? null : wasmUrl;
    const runtime = await loadPumpkinRuntime(normalizedUrl);
    const startMs = performance.now();

    if (type === "check") {
      const responseJson = runtime.check_with_callback(requestJson, null);
      const runTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
      workerScope.postMessage({
        id,
        type: "CHECK_SUCCESS",
        responseJson,
        runTime,
      });
      return;
    }

    if (type === "solve") {
      const responseJson = runtime.solve_with_callback(
        requestJson,
        (payloadJson: string) => {
          const elapsedTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
          workerScope.postMessage({
            id,
            type: "SOLVE_PROGRESS",
            payloadJson,
            elapsedTime,
          });
          return false;
        },
        null
      );
      const runTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
      workerScope.postMessage({
        id,
        type: "SOLVE_SUCCESS",
        responseJson,
        runTime,
      });
      return;
    }

    throw new Error(`[WaSHI] Unknown Pumpkin worker command "${String(type)}".`);
  } catch (err) {
    workerScope.postMessage({
      id,
      type: "SOLVER_ERROR",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
