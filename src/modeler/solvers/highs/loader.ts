import type { Highs, Model as HighsPersistentModel, SymbolDisposable } from "highs";
import type { SolveOptions } from "../../types.js";
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
  options: SolveOptions = {}
): Promise<{ result: RawHighsSolveResult; runTime: number }> {
  const highs = await getHighs(options);
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
        m.run();

        const statusCode: number = m.getModelStatus();
        const statusStr = HIGHS_STATUS_NAMES[statusCode] ?? "Unknown";
        const dims = m.getDimensions();

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
        const hasPrimalSolution = primalSolutionStatus === feasibleCode;
        const hasDualSolution = dualSolutionStatus === feasibleCode;

        let isMip = false;
        for (let j = 0; j < dims.numCols; j++) {
          if (m.getColIntegrality(j) !== 0) {
            isMip = true;
            break;
          }
        }

        const sol = hasPrimalSolution || hasDualSolution ? m.getSolution() : null;

        const Columns: RawHighsSolveResult["Columns"] = {};
        for (let j = 0; j < dims.numCols; j++) {
          const name = m.getColName(j);
          const integ = m.getColIntegrality(j);
          const colEntry: RawHighsSolveResult["Columns"][string] = {
            Index: j,
            Type: integ === 1 ? "Integer" : "Continuous",
            Name: name,
          };
          if (hasPrimalSolution && sol) {
            colEntry.Primal = sol.colValue[j];
          }
          if (!isMip && hasDualSolution && sol) {
            colEntry.Dual = sol.colDual[j];
          }
          Columns[name] = colEntry;
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
          if (hasPrimalSolution && sol) {
            rowEntry.Primal = sol.rowValue[i];
          }
          if (!isMip && hasDualSolution && sol) {
            rowEntry.Dual = sol.rowDual[i];
          }
          Rows.push(rowEntry);
        }

        const objectiveValue = hasPrimalSolution ? m.getObjectiveValue() : NaN;
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
          try {
            const rawGap = Number(m.info.get("mip_gap"));
            if (Number.isFinite(rawGap)) {
              mipGap = rawGap;
            }
          } catch {
            // Unavailable info
          }
        }

        return {
          Status: statusStr,
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
