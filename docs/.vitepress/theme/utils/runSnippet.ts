import { transpileSnippetToJs } from "./transpile";
import type { SolveOptions } from "../../../../src/modeler/types.ts";
import type { Solver } from "../../../../src/modeler/solvers/types.ts";

export type SnippetRunPhase = "loading" | "running";

export interface SnippetRunOptions {
  onPhase?: (phase: SnippetRunPhase) => void;
}

export interface SnippetRunResult {
  logs: string[];
  errorMsg: string | null;
  loadTimeMs: number;
  solveTimeMs: number | null;
  runTimeMs: number;
  wasCached: boolean;
}

export interface SnippetStatusLabels {
  executed: string;
  loadLabel: string;
  cachedLabel: string;
  solveLabel: string;
  runLabel: string;
}

type ModelerModule = typeof import("../../../../src/index.ts");
type Z3Module = typeof import("../../../../src/modeler/solvers/z3/index.ts");
type GlpkModule = typeof import("../../../../src/modeler/solvers/glpk/index.ts");

let cachedModeler: ModelerModule | null = null;
let cachedZ3Mod: Z3Module | null = null;
let cachedGlpkMod: GlpkModule | null = null;
let z3AssetsConfigured = false;
let highsWarmed = false;

/**
 * Reset cached module/solver warmup tracking in tests so cold-load timing can be exercised.
 */
export function resetSnippetRunnerStateForTests(): void {
  cachedModeler = null;
  cachedZ3Mod = null;
  cachedGlpkMod = null;
  z3AssetsConfigured = false;
  highsWarmed = false;
}

/**
 * Formats separated load/solve (or fallback run) timing into a concise status string.
 */
export function formatSnippetStatus(
  timing: Pick<SnippetRunResult, "loadTimeMs" | "solveTimeMs" | "runTimeMs" | "wasCached">,
  labels: SnippetStatusLabels
): string {
  if (timing.solveTimeMs !== null) {
    const loadPart = timing.wasCached
      ? labels.cachedLabel
      : `${labels.loadLabel} ${timing.loadTimeMs.toFixed(1)} ms`;
    return `${loadPart} · ${labels.solveLabel} ${timing.solveTimeMs.toFixed(1)} ms`;
  }
  if (!timing.wasCached && timing.loadTimeMs > 0) {
    return `${labels.loadLabel} ${timing.loadTimeMs.toFixed(1)} ms · ${labels.runLabel} ${timing.runTimeMs.toFixed(1)} ms`;
  }
  return `${labels.executed} (${timing.runTimeMs.toFixed(1)} ms)`;
}

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function extractNewModelArgs(rawCode: string): string[] {
  const argsList: string[] = [];
  const regex = /\bnew\s+Model\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawCode)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    let quote: string | null = null;
    while (i < rawCode.length && depth > 0) {
      const ch = rawCode[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
      i++;
    }
    argsList.push(rawCode.slice(start, Math.max(start, i - 1)));
  }
  return argsList;
}

function detectRequiredSolvers(rawCode: string): {
  needsHighs: boolean;
  needsZ3: boolean;
  needsGlpk: boolean;
} {
  const needsZ3 = /\bz3\b|@ohtaman\/washi\/solvers\/z3/.test(rawCode);
  const needsGlpk = /\bglpk\b|@ohtaman\/washi\/solvers\/glpk/.test(rawCode);
  const usesModel =
    /\bModel\b|\.(?:solve|check|solveColumnGeneration|solveBenders)\s*\(/.test(rawCode);
  const newModelArgs = extractNewModelArgs(rawCode);
  const hasDefaultHighsModel =
    newModelArgs.length > 0
      ? newModelArgs.some((args) => !/\bsolver\s*:\s*["'](?:z3|glpk)["']/.test(args))
      : !needsZ3 && !needsGlpk;
  const needsHighs = usesModel && (/\bhighs\b/.test(rawCode) || hasDefaultHighsModel);
  return { needsHighs, needsZ3, needsGlpk };
}

function extractCallTarget(
  modelSolverName: string | undefined,
  solverOrOptions?: Solver | string | SolveOptions,
  maybeOptions?: SolveOptions
): { solverName: string; solveOptions: SolveOptions } {
  if (typeof solverOrOptions === "string") {
    return { solverName: solverOrOptions, solveOptions: maybeOptions ?? {} };
  }
  if (solverOrOptions && typeof solverOrOptions === "object" && "solve" in solverOrOptions) {
    return { solverName: solverOrOptions.name, solveOptions: maybeOptions ?? {} };
  }
  const opts = solverOrOptions ?? {};
  const solverChoice = opts.solver;
  const solverName =
    typeof solverChoice === "string"
      ? solverChoice
      : solverChoice?.name ?? modelSolverName ?? "highs";
  return { solverName, solveOptions: opts };
}

/**
 * Transpiles and executes a WaSHI documentation TypeScript/JavaScript snippet
 * in-process against the live WebAssembly modeler with an isolated lexical
 * `console` binding so solver engine stdout banners never pollute snippet output.
 * Separates one-time JS/WASM loading latency from snippet execution and solver solve time.
 */
export async function runWashiSnippet(
  rawCode: string,
  options: SnippetRunOptions = {}
): Promise<SnippetRunResult> {
  const capturedLogs: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  const customConsole = {
    log: (...args: unknown[]) => {
      capturedLogs.push(args.map(formatConsoleArg).join(" "));
      origLog(...args);
    },
    warn: (...args: unknown[]) => {
      capturedLogs.push("[WARN] " + args.map(formatConsoleArg).join(" "));
      origWarn(...args);
    },
    error: (...args: unknown[]) => {
      capturedLogs.push("[ERROR] " + args.map(formatConsoleArg).join(" "));
      origError(...args);
    },
  };

  const { needsHighs, needsZ3, needsGlpk } = detectRequiredSolvers(rawCode);
  const hasCustomHighsConfig = /\b(?:setHighsWasmUrl|wasmUrl|useWorker)\b/.test(rawCode);
  const hasCustomZ3Config = /\bsetZ3Assets\b/.test(rawCode);
  const mayNeedLoad =
    !cachedModeler ||
    (needsHighs && !hasCustomHighsConfig && !highsWarmed) ||
    (needsZ3 && !hasCustomZ3Config && (!cachedZ3Mod || !cachedZ3Mod.isZ3Loaded())) ||
    (needsGlpk && (!cachedGlpkMod || !cachedGlpkMod.isGlpkLoaded()));

  let didLoad = false;
  let preLoadTimeMs = 0;
  let inSnippetLoadMs = 0;
  let execStart: number | null = null;
  let solveCalls = 0;
  let totalSolveTimeSec = 0;

  const loadStart = performance.now();
  try {
    if (mayNeedLoad) {
      options.onPhase?.("loading");
    }

    if (!cachedModeler) {
      didLoad = true;
      cachedModeler = await import("../../../../src/index.ts");
    }
    const Modeler = cachedModeler;

    if (needsZ3) {
      if (!cachedZ3Mod) {
        didLoad = true;
        cachedZ3Mod = await import("../../../../src/modeler/solvers/z3/index.ts");
      }
      if (typeof window !== "undefined" && !z3AssetsConfigured && !hasCustomZ3Config) {
        cachedZ3Mod.setZ3Assets({
          jsUrl: new URL("/z3-built.js", window.location.origin).href,
          wasmUrl: new URL("/z3-built.wasm", window.location.origin).href,
        });
        z3AssetsConfigured = true;
      }
      if (!hasCustomZ3Config && !cachedZ3Mod.isZ3Loaded()) {
        didLoad = true;
        await cachedZ3Mod.loadZ3();
      }
    }

    if (needsGlpk) {
      if (!cachedGlpkMod) {
        didLoad = true;
        cachedGlpkMod = await import("../../../../src/modeler/solvers/glpk/index.ts");
      }
      if (!cachedGlpkMod.isGlpkLoaded()) {
        didLoad = true;
        await cachedGlpkMod.getGlpk();
      }
    }

    if (needsHighs && !hasCustomHighsConfig) {
      const { warmupHighs } = await import("../../../../src/modeler/solvers/highs/worker-client.ts");
      const { cached } = await warmupHighs();
      if (!cached) {
        didLoad = true;
      }
      highsWarmed = true;
    }

    preLoadTimeMs = didLoad ? performance.now() - loadStart : 0;

    const pendingPromises: Promise<unknown>[] = [];

    const warmSolverForCall = async (
      modelSolverName: string | undefined,
      solverOrOptions?: Solver | string | SolveOptions,
      maybeOptions?: SolveOptions
    ) => {
      const { solverName, solveOptions } = extractCallTarget(
        modelSolverName,
        solverOrOptions,
        maybeOptions
      );
      if (solverName === "highs") {
        const { isHighsWarmed, warmupHighs } = await import(
          "../../../../src/modeler/solvers/highs/worker-client.ts"
        );
        if (await isHighsWarmed(solveOptions)) {
          return;
        }
        options.onPhase?.("loading");
        const warmStart = performance.now();
        try {
          const { cached } = await warmupHighs(solveOptions);
          if (!cached) {
            didLoad = true;
            inSnippetLoadMs += performance.now() - warmStart;
          }
          if (!solveOptions.wasmUrl && solveOptions.useWorker === undefined && !hasCustomHighsConfig) {
            highsWarmed = true;
          } else if (!cached) {
            highsWarmed = false;
          }
        } catch (err) {
          inSnippetLoadMs += performance.now() - warmStart;
          throw err;
        } finally {
          options.onPhase?.("running");
        }
      } else if (solverName === "z3" && hasCustomZ3Config) {
        const z3Mod =
          cachedZ3Mod ?? (cachedZ3Mod = await import("../../../../src/modeler/solvers/z3/index.ts"));
        if (!z3Mod.isZ3Loaded()) {
          options.onPhase?.("loading");
          const warmStart = performance.now();
          try {
            await z3Mod.loadZ3(solveOptions);
            didLoad = true;
          } finally {
            inSnippetLoadMs += performance.now() - warmStart;
            options.onPhase?.("running");
          }
        }
      }
    };

    const trackOperation = <T>(
      modelInstance: InstanceType<typeof Modeler.Model>,
      args: [Solver | string | SolveOptions | undefined, SolveOptions | undefined],
      run: () => Promise<T>
    ): Promise<T> => {
      const p = (async () => {
        await warmSolverForCall(modelInstance.solver?.name, args[0], args[1]);
        const res = await run();
        solveCalls++;
        totalSolveTimeSec += Number.isFinite(modelInstance.runTime) ? modelInstance.runTime : 0;
        return res;
      })();
      pendingPromises.push(p);
      return p;
    };

    class TrackedModel extends Modeler.Model {
      override solve(...args: Parameters<InstanceType<typeof Modeler.Model>["solve"]>) {
        return trackOperation(this, [args[0], args[1]], () => super.solve(...args));
      }
      override check(...args: Parameters<InstanceType<typeof Modeler.Model>["check"]>) {
        return trackOperation(this, [args[0], args[1]], () => super.check(...args));
      }
    }

    const context: Record<string, unknown> = {
      ...Modeler,
      Model: TrackedModel,
      console: customConsole,
    };

    const jsCode = transpileSnippetToJs(rawCode);
    const keys = Object.keys(context);
    const values = Object.values(context);

    options.onPhase?.("running");
    execStart = performance.now();
    const fn = new Function(...keys, `return (async () => {\n${jsCode}\n})();`);
    await fn(...values);
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    const runTimeMs = Math.max(0, performance.now() - execStart - inSnippetLoadMs);
    return {
      logs: capturedLogs,
      errorMsg: null,
      loadTimeMs: preLoadTimeMs + inSnippetLoadMs,
      solveTimeMs: solveCalls > 0 ? totalSolveTimeSec * 1000 : null,
      runTimeMs,
      wasCached: !didLoad,
    };
  } catch (err: unknown) {
    const now = performance.now();
    return {
      logs: capturedLogs,
      errorMsg: err instanceof Error ? err.message : String(err),
      loadTimeMs: execStart === null ? now - loadStart : preLoadTimeMs + inSnippetLoadMs,
      solveTimeMs: solveCalls > 0 ? totalSolveTimeSec * 1000 : null,
      runTimeMs: execStart === null ? 0 : Math.max(0, now - execStart - inSnippetLoadMs),
      wasCached: !didLoad,
    };
  }
}
