import type { Highs, Model as HighsPersistentModel, SymbolDisposable } from "highs";
import type { SolveOptions, SolveProgressEvent } from "../../types.js";
import { getBundledWasmUrl } from "./assets.js";
import { loadNodeHighs } from "./node-runtime.js";

export const OFFICIAL_HIGHS_CDN_WASM_URL =
  "https://cdn.jsdelivr.net/npm/highs@1.15.3/build/highs.wasm";

type HighsInstance = Highs;

let cachedHighsPromise: Promise<HighsInstance> | null = null;
let cachedWasmKey: string | null = null;
let customWasmUrl: string | null = null;

export function setHighsWasmUrl(url: string | null) {
  customWasmUrl = url;
  // Invalidate cache if wasm url changes before load
  cachedHighsPromise = null;
  cachedWasmKey = null;
}

export function getHighsWasmUrl(): string | null {
  return customWasmUrl;
}

/**
 * Check if the given byte array begins with the standard WebAssembly magic header (\0asm).
 */
export function isValidWasmHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  );
}

/**
 * Probe a URL to determine whether it serves a valid WebAssembly binary
 * without downloading the entire file. Cancels the stream after checking the first chunk.
 */
export async function probeWasmUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-3" },
    });

    if (!res.ok) {
      return false;
    }

    const contentType = res.headers.get("content-type") || "";
    // If the server returned an HTML page (e.g. 404 SPA fallback to index.html), it's not valid WASM
    if (contentType.includes("text/html")) {
      return false;
    }

    if (!res.body) {
      return true;
    }

    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    await reader.cancel();

    if (done || !value || value.length < 4) {
      return false;
    }

    return isValidWasmHeader(value);
  } catch {
    return false;
  }
}

/**
 * Resolve the HiGHS WASM URL for browser / worker environments.
 * - Explicit URLs (customWasmUrl or options.wasmUrl) are strictly used (no CDN fallback).
 * - Default resolution uses the package asset, with no probe or external fallback.
 */
export async function resolveBrowserWasmUrl(explicitUrl?: string): Promise<string> {
  if (explicitUrl) {
    return explicitUrl;
  }
  if (customWasmUrl) {
    return customWasmUrl;
  }

  return getBundledWasmUrl();
}

/**
 * Get or initialize the HiGHS WebAssembly solver instance.
 * Works seamlessly in Node.js, Web Browsers, and Web Workers.
 */
export async function getHighs(options: SolveOptions = {}): Promise<HighsInstance> {
  const isNode =
    typeof process !== "undefined" && process.versions?.node &&
    (process as any).type !== "renderer";
  const wasmUrl = isNode ? null : await resolveBrowserWasmUrl(options.wasmUrl);
  const key = wasmUrl ?? "node";
  if (cachedHighsPromise && cachedWasmKey === key) {
    return cachedHighsPromise;
  }

  cachedWasmKey = key;
  const initializing: Promise<HighsInstance> = (async () => {
    // Dynamically import highs to ensure compatibility with ESM / Bundler / Node
    const loadHighs = isNode
      ? await loadNodeHighs()
      : (await import("./browser-runtime.js")).default;

    if (isNode) {
      return await loadHighs();
    }

    // Browser or Web Worker environment
    const highsInstance = await loadHighs({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl!;
        }
        return file;
      },
    });

    return highsInstance;
  })().catch((error) => {
    if (cachedHighsPromise === initializing) {
      cachedHighsPromise = null;
      cachedWasmKey = null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[WaSHI] Failed to initialize HiGHS${wasmUrl ? ` from "${wasmUrl}"` : ""}. ` +
      `Deploy the package's WASM asset or explicitly set wasmUrl; no CDN fallback is attempted. ${message}`,
      { cause: error },
    );
  });
  cachedHighsPromise = initializing;
  return initializing;
}

export interface RawHighsSolveResult {
  Status: string;
  StatusCode?: number;
  PrimalSolutionStatus?: number;
  DualSolutionStatus?: number;
  HasPrimalSolution?: boolean;
  IsMip?: boolean;
  ObjectiveValue: number;
  ObjectiveOffsetApplied?: boolean;
  MipDualBound?: number;
  MipGap?: number;
  Columns: Record<string, {
    Index?: number;
    Lower?: number;
    Upper?: number;
    Type?: string;
    Primal?: number;
    Dual?: number;
    Name?: string;
  }>;
  Rows?: Record<string, {
    Index: number;
    Lower?: number;
    Upper?: number;
    Dual?: number;
    Primal?: number;
    Name?: string;
  }> | Array<{
    Index: number;
    Lower?: number;
    Upper?: number;
    Dual?: number;
    Primal?: number;
    Name?: string;
  }>;
}

export interface HighsIncumbentSnapshot {
  objectiveValue: number;
  mipDualBound?: number;
  mipGap?: number;
  columns: RawHighsSolveResult["Columns"];
}

const HIGHS_STATUS_NAMES: Record<number, string> = {
  0: "Not Set",
  1: "Load error",
  2: "Model error",
  3: "Presolve error",
  4: "Solve error",
  5: "Postsolve error",
  6: "Empty",
  7: "Optimal",
  8: "Infeasible",
  9: "Primal infeasible or unbounded",
  10: "Unbounded",
  11: "Bound on objective reached",
  12: "Target for objective reached",
  13: "Time limit reached",
  14: "Iteration limit reached",
  15: "Unknown",
  16: "Solution limit reached",
  17: "Interrupted",
  18: "Memory limit reached",
};

/**
 * Solve an LP formatted model using HiGHS WASM
 */
export async function solveLpWithHighs(
  lpString: string,
  options: SolveOptions & {
    onIncumbent?: (incumbent: HighsIncumbentSnapshot) => void;
  } = {}
): Promise<{ result: RawHighsSolveResult; runTime: number }> {
  if (options.signal?.aborted) {
    return {
      result: {
        Status: "Interrupted",
        StatusCode: 17,
        HasPrimalSolution: false,
        ObjectiveValue: NaN,
        Columns: {},
        Rows: [],
      },
      runTime: 0,
    };
  }

  const highs = await getHighs(options);
  if (options.signal?.aborted) {
    return {
      result: {
        Status: "Interrupted",
        StatusCode: 17,
        HasPrimalSolution: false,
        ObjectiveValue: NaN,
        Columns: {},
        Rows: [],
      },
      runTime: 0,
    };
  }

  const startTime = performance.now();

  const highsOptions: Record<string, any> = {
    output_flag: options.outputFlag ?? false,
  };

  if (options.timeLimit !== undefined) {
    highsOptions.time_limit = options.timeLimit;
  }
  if (options.presolve !== undefined) {
    highsOptions.presolve = options.presolve;
  }
  if (options.solver !== undefined) {
    highsOptions.solver = options.solver;
  }
  if (options.relGap !== undefined) {
    highsOptions.mip_rel_gap = options.relGap;
  } else if (options.mipGap !== undefined) {
    highsOptions.mip_rel_gap = options.mipGap;
  }
  if (options.absGap !== undefined) {
    highsOptions.mip_abs_gap = options.absGap;
  }

  const passthroughKeys = [
    "mip_max_nodes",
    "mip_max_improving_sols",
    "mip_max_leaves",
    "simplex_iteration_limit",
    "ipm_iteration_limit",
  ] as const;
  for (const key of passthroughKeys) {
    if (options[key] !== undefined) {
      highsOptions[key] = options[key];
    }
  }

  const objectiveOffset =
    typeof options.objectiveOffset === "number" && Number.isFinite(options.objectiveOffset)
      ? options.objectiveOffset
      : 0;

  if (typeof highs.withModel === "function") {
    const result = highs.withModel(
      { format: "lp", data: lpString },
      (m: SymbolDisposable<HighsPersistentModel>): RawHighsSolveResult => {
        if (objectiveOffset !== 0 && typeof m.changeObjectiveOffset === "function") {
          const baseOffset = typeof m.getObjectiveOffset === "function" ? m.getObjectiveOffset() : 0;
          m.changeObjectiveOffset(baseOffset + objectiveOffset);
        }
        for (const [optName, optVal] of Object.entries(highsOptions)) {
          try {
            m.options.set(optName, optVal as any);
          } catch (err: any) {
            if (
              err?.name !== "HighsUnsupportedOptionError" &&
              !(
                highs.errors?.HighsUnsupportedOptionError &&
                err instanceof highs.errors.HighsUnsupportedOptionError
              )
            ) {
              throw err;
            }
          }
        }

        const dims = m.getDimensions();
        const colMeta: Array<{ name: string; type: string }> = [];
        let isMip = false;
        for (let j = 0; j < dims.numCols; j++) {
          const integ = m.getColIntegrality(j);
          if (integ !== 0) {
            isMip = true;
          }
          colMeta.push({
            name: m.getColName(j),
            type: integ === 1 ? "Integer" : "Continuous",
          });
        }

        let lastIncumbentSnapshot: HighsIncumbentSnapshot | null = null;
        let lastProgressEvent: SolveProgressEvent | null = null;
        let emittedProgressCount = 0;

        const extractProgressEvent = (event: any): SolveProgressEvent => {
          const data = event?.data ?? {};
          const elapsedSeconds =
            typeof data.running_time === "number" && Number.isFinite(data.running_time)
              ? data.running_time
              : (performance.now() - startTime) / 1000;
          const objectiveValue =
            typeof data.mip_primal_bound === "number" && Number.isFinite(data.mip_primal_bound)
              ? data.mip_primal_bound
              : typeof data.objective_function_value === "number" && Number.isFinite(data.objective_function_value)
                ? data.objective_function_value
                : undefined;
          const objectiveBound =
            typeof data.mip_dual_bound === "number" && Number.isFinite(data.mip_dual_bound)
              ? data.mip_dual_bound
              : undefined;
          const relGap =
            typeof data.mip_gap === "number" && Number.isFinite(data.mip_gap)
              ? data.mip_gap
              : undefined;
          const absGap =
            objectiveValue !== undefined && objectiveBound !== undefined
              ? Math.abs(objectiveValue - objectiveBound)
              : undefined;
          const nodes =
            typeof data.mip_node_count === "bigint"
              ? Number(data.mip_node_count)
              : typeof data.mip_node_count === "number" && Number.isFinite(data.mip_node_count)
                ? data.mip_node_count
                : undefined;
          const iterations =
            typeof data.mip_total_lp_iterations === "bigint"
              ? Number(data.mip_total_lp_iterations)
              : typeof data.simplex_iteration_count === "number" && Number.isFinite(data.simplex_iteration_count)
                ? data.simplex_iteration_count
                : typeof data.ipm_iteration_count === "number" && Number.isFinite(data.ipm_iteration_count)
                  ? data.ipm_iteration_count
                  : undefined;
          const message =
            typeof event?.message === "string" && event.message.trim().length > 0
              ? event.message.trim()
              : undefined;
          const prog: SolveProgressEvent = {
            elapsedTime: elapsedSeconds,
            elapsedSeconds,
            ...(objectiveValue !== undefined ? { objectiveValue } : {}),
            ...(objectiveBound !== undefined ? { objectiveBound } : {}),
            ...(relGap !== undefined ? { relGap, mipGap: relGap } : {}),
            ...(absGap !== undefined ? { absGap } : {}),
            ...(nodes !== undefined ? { nodes } : {}),
            ...(iterations !== undefined ? { iterations } : {}),
            ...(message !== undefined ? { message } : {}),
          };
          lastProgressEvent = prog;
          return prog;
        };

        const captureIncumbentFromEvent = (event: any) => {
          const data = event?.data;
          if (!data || !(data.mip_solution instanceof Float64Array)) {
            return;
          }
          const vec = data.mip_solution as Float64Array;
          const cols: RawHighsSolveResult["Columns"] = {};
          for (let j = 0; j < colMeta.length && j < vec.length; j++) {
            cols[colMeta[j].name] = {
              Index: j,
              Type: colMeta[j].type,
              Name: colMeta[j].name,
              Primal: vec[j],
            };
          }
          const obj =
            typeof data.objective_function_value === "number" && Number.isFinite(data.objective_function_value)
              ? data.objective_function_value
              : typeof data.mip_primal_bound === "number" && Number.isFinite(data.mip_primal_bound)
                ? data.mip_primal_bound
                : NaN;
          if (Number.isFinite(obj)) {
            lastIncumbentSnapshot = {
              objectiveValue: obj,
              ...(typeof data.mip_dual_bound === "number" && Number.isFinite(data.mip_dual_bound)
                ? { mipDualBound: data.mip_dual_bound }
                : {}),
              ...(typeof data.mip_gap === "number" && Number.isFinite(data.mip_gap)
                ? { mipGap: data.mip_gap }
                : {}),
              columns: cols,
            };
            options.onIncumbent?.(lastIncumbentSnapshot);
          }
        };

        let didInterrupt = false;
        const hasCallbacks = Boolean(options.signal || options.onProgress || options.onIncumbent);
        if (hasCallbacks) {
          const cbTypes = highs.constants?.callbackType ?? {
            logging: 0,
            simplexInterrupt: 1,
            ipmInterrupt: 2,
            mipSolution: 3,
            mipImprovingSolution: 4,
            mipLogging: 5,
            mipInterrupt: 6,
          };
          const handleInterrupt = (event: any): undefined => {
            if (options.signal?.aborted) {
              didInterrupt = true;
              event.interrupt();
              return undefined;
            }
            if (options.onProgress) {
              emittedProgressCount++;
              options.onProgress(extractProgressEvent(event));
              if (options.signal?.aborted) {
                didInterrupt = true;
                event.interrupt();
              }
            }
            return undefined;
          };

          const callbacks: Record<number, (event: any) => undefined> = {
            [cbTypes.simplexInterrupt]: handleInterrupt,
            [cbTypes.ipmInterrupt]: handleInterrupt,
            [cbTypes.mipInterrupt]: handleInterrupt,
            [cbTypes.mipImprovingSolution]: (event: any): undefined => {
              captureIncumbentFromEvent(event);
              if (options.onProgress && !options.signal?.aborted) {
                emittedProgressCount++;
                options.onProgress(extractProgressEvent(event));
              }
              return undefined;
            },
            [cbTypes.mipLogging]: (event: any): undefined => {
              if (options.onProgress && !options.signal?.aborted) {
                emittedProgressCount++;
                options.onProgress(extractProgressEvent(event));
              }
              return undefined;
            },
          };
          m.run(callbacks);
        } else {
          m.run();
        }

        let statusCode: number = m.getModelStatus();
        if (didInterrupt) {
          statusCode = 17;
        }
        const statusStr = HIGHS_STATUS_NAMES[statusCode] ?? "Unknown";

        let primalSolutionStatus = 0;
        let dualSolutionStatus = 0;
        try {
          primalSolutionStatus = Number(m.info.get("primal_solution_status"));
        } catch {
          // Unavailable info
        }
        try {
          dualSolutionStatus = Number(m.info.get("dual_solution_status"));
        } catch {
          // Unavailable info
        }
        const feasibleCode = highs.constants?.solutionStatus?.feasible ?? 2;
        const hasNativePrimal = primalSolutionStatus === feasibleCode;
        const hasDualSolution = dualSolutionStatus === feasibleCode;

        const sol = hasNativePrimal || hasDualSolution ? m.getSolution() : null;

        let hasPrimalSolution = hasNativePrimal;
        let Columns: RawHighsSolveResult["Columns"] = {};
        if (!hasNativePrimal && lastIncumbentSnapshot !== null) {
          hasPrimalSolution = true;
          Columns = (lastIncumbentSnapshot as HighsIncumbentSnapshot).columns;
        } else {
          for (let j = 0; j < dims.numCols; j++) {
            const meta = colMeta[j];
            const colEntry: RawHighsSolveResult["Columns"][string] = {
              Index: j,
              Type: meta.type,
              Name: meta.name,
            };
            if (hasNativePrimal && sol) {
              colEntry.Primal = sol.colValue[j];
            }
            if (!isMip && hasDualSolution && sol) {
              colEntry.Dual = sol.colDual[j];
            }
            Columns[meta.name] = colEntry;
          }
        }

        const Rows: Array<{
          Index: number;
          Dual?: number;
          Primal?: number;
          Name?: string;
        }> = [];
        for (let i = 0; i < dims.numRows; i++) {
          const name = m.getRowName(i);
          const rowEntry: {
            Index: number;
            Dual?: number;
            Primal?: number;
            Name?: string;
          } = {
            Index: i,
            Name: name,
          };
          if (hasNativePrimal && sol) {
            rowEntry.Primal = sol.rowValue[i];
          }
          if (!isMip && hasDualSolution && sol) {
            rowEntry.Dual = sol.rowDual[i];
          }
          Rows.push(rowEntry);
        }

        const objectiveValue = hasNativePrimal
          ? m.getObjectiveValue()
          : lastIncumbentSnapshot !== null
            ? (lastIncumbentSnapshot as HighsIncumbentSnapshot).objectiveValue
            : NaN;
        let mipDualBound: number | undefined;
        let mipGap: number | undefined;
        if (isMip) {
          try {
            const rawBound = Number(m.info.get("mip_dual_bound"));
            if (Number.isFinite(rawBound)) {
              mipDualBound = rawBound;
            }
          } catch {
            // Unavailable info
          }
          if (mipDualBound === undefined && lastProgressEvent && (lastProgressEvent as SolveProgressEvent).objectiveBound !== undefined) {
            mipDualBound = (lastProgressEvent as SolveProgressEvent).objectiveBound;
          }
          try {
            const rawGap = Number(m.info.get("mip_gap"));
            if (Number.isFinite(rawGap)) {
              mipGap = rawGap;
            }
          } catch {
            // Unavailable info
          }
          if (mipGap === undefined && lastProgressEvent && (lastProgressEvent as SolveProgressEvent).relGap !== undefined) {
            mipGap = (lastProgressEvent as SolveProgressEvent).relGap;
          }
        }

        return {
          Status: HIGHS_STATUS_NAMES[statusCode] ?? statusStr,
          StatusCode: statusCode,
          PrimalSolutionStatus: primalSolutionStatus,
          DualSolutionStatus: dualSolutionStatus,
          HasPrimalSolution: hasPrimalSolution,
          IsMip: isMip,
          ObjectiveValue: objectiveValue,
          ObjectiveOffsetApplied: objectiveOffset !== 0,
          MipDualBound: mipDualBound,
          MipGap: mipGap,
          Columns,
          Rows,
        };
      }
    );
    const endTime = performance.now();
    const runTime = (endTime - startTime) / 1000;
    return { result, runTime };
  }

  const result = highs.solve(lpString, highsOptions);
  const endTime = performance.now();
  const runTime = (endTime - startTime) / 1000;

  return { result, runTime };
}
