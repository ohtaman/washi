import type { SolveOptions } from "./modeler/types.js";

type HighsInstance = any;

let cachedHighsPromise: Promise<HighsInstance> | null = null;
let customWasmUrl: string | null = null;

export function setHighsWasmUrl(url: string) {
  customWasmUrl = url;
  // Invalidate cache if wasm url changes before load
  cachedHighsPromise = null;
}

/**
 * Get or initialize the HiGHS WebAssembly solver instance.
 * Works seamlessly in Node.js, Web Browsers, and Web Workers.
 */
export async function getHighs(options: SolveOptions = {}): Promise<HighsInstance> {
  if (cachedHighsPromise) {
    return cachedHighsPromise;
  }

  cachedHighsPromise = (async () => {
    // Dynamically import highs to ensure compatibility with ESM / Bundler / Node
    const highsModule = await import("highs");
    const loadHighs = highsModule.default || highsModule;

    const isNode =
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node &&
      (process as any).type !== "renderer";

    if (isNode) {
      return await loadHighs();
    }

    // Browser or Web Worker environment
    const wasmUrl = options.wasmUrl || customWasmUrl || "/highs.wasm";

    const highsInstance = await loadHighs({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl;
        }
        return file;
      },
    });

    return highsInstance;
  })();

  return cachedHighsPromise;
}

export interface RawHighsSolveResult {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, {
    Index: number;
    Lower: number;
    Upper: number;
    Type: string;
    Primal: number;
    Dual?: number;
    Name: string;
  }>;
  Rows?: Record<string, {
    Index: number;
    Lower: number;
    Upper: number;
    Dual?: number;
    Primal?: number;
    Name: string;
  }>;
}

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
  }
  if (options.absGap !== undefined) {
    highsOptions.mip_abs_gap = options.absGap;
  }

  const result = highs.solve(lpString, highsOptions);
  const endTime = performance.now();
  const runTime = (endTime - startTime) / 1000;

  return { result, runTime };
}
