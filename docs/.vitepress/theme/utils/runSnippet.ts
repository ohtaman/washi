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

/**
 * Reset cached module/solver plugin tracking in tests so cold-load timing can be exercised.
 */
export function resetSnippetRunnerStateForTests(): void {
  cachedModeler = null;
  cachedZ3Mod = null;
  cachedGlpkMod = null;
  z3AssetsConfigured = false;
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

function extractCallTarget(
  modelSolver: Solver | null | undefined,
  getDefaultSolver: (options?: SolveOptions) => Solver,
  solverOrOptions?: Solver | string | SolveOptions,
  maybeOptions?: SolveOptions
): { solverName: string; solveOptions: SolveOptions } {
  if (typeof solverOrOptions === "string") {
    return { solverName: solverOrOptions.toLowerCase(), solveOptions: maybeOptions ?? {} };
  }
  if (solverOrOptions && typeof solverOrOptions === "object" && "solve" in solverOrOptions) {
    return { solverName: solverOrOptions.name.toLowerCase(), solveOptions: maybeOptions ?? {} };
  }
  const opts = solverOrOptions ?? {};
  const solverChoice = opts.solver;
  const resolvedName =
    typeof solverChoice === "string"
      ? solverChoice
      : solverChoice?.name ?? modelSolver?.name ?? getDefaultSolver(opts).name;
  return { solverName: resolvedName.toLowerCase(), solveOptions: opts };
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

  const needsZ3Plugin = rawCode.includes("z3");
  const needsGlpkPlugin = rawCode.includes("glpk");
  const mayNeedJsLoad =
    !cachedModeler ||
    (needsZ3Plugin && !cachedZ3Mod) ||
    (needsGlpkPlugin && !cachedGlpkMod);

  let didLoad = false;
  let currentPhase: SnippetRunPhase | null = null;
  const emitPhase = (phase: SnippetRunPhase) => {
    if (currentPhase !== phase) {
      currentPhase = phase;
      options.onPhase?.(phase);
    }
  };
  let preLoadTimeMs = 0;
  let inSnippetLoadMs = 0;
  let execStart: number | null = null;
  let solveCalls = 0;
  let totalSolveTimeSec = 0;

  const loadStart = performance.now();
  try {
    if (mayNeedJsLoad) {
      emitPhase("loading");
    }

    if (!cachedModeler) {
      didLoad = true;
      cachedModeler = await import("../../../../src/index.ts");
    }
    const Modeler = cachedModeler;

    // Register optional solver plugins synchronously without initializing WASM or asset configs;
    // actual WASM/worker loading happens only when an operation executes with that solver.
    if (needsZ3Plugin && !cachedZ3Mod) {
      didLoad = true;
      cachedZ3Mod = await import("../../../../src/modeler/solvers/z3/index.ts");
    }
    if (needsGlpkPlugin && !cachedGlpkMod) {
      didLoad = true;
      cachedGlpkMod = await import("../../../../src/modeler/solvers/glpk/index.ts");
    }

    preLoadTimeMs = didLoad ? performance.now() - loadStart : 0;

    const pendingPromises: Promise<unknown>[] = [];

    const measureSolverLoad = async <T>(loadFn: () => Promise<T>): Promise<T> => {
      emitPhase("loading");
      const warmStart = performance.now();
      try {
        return await loadFn();
      } finally {
        inSnippetLoadMs += performance.now() - warmStart;
        emitPhase("running");
      }
    };

    const warmSolverForCall = async (
      modelSolver: Solver | null | undefined,
      solverOrOptions?: Solver | string | SolveOptions,
      maybeOptions?: SolveOptions
    ) => {
      const { solverName, solveOptions } = extractCallTarget(
        modelSolver,
        (opts) => Modeler.getSolver(undefined, opts),
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
        emitPhase("loading");
        const warmStart = performance.now();
        try {
          const { cached } = await warmupHighs(solveOptions);
          if (!cached) {
            didLoad = true;
            inSnippetLoadMs += performance.now() - warmStart;
          }
        } catch (err) {
          inSnippetLoadMs += performance.now() - warmStart;
          throw err;
        } finally {
          emitPhase("running");
        }
      } else if (solverName === "z3") {
        const z3Mod =
          cachedZ3Mod ?? (cachedZ3Mod = await import("../../../../src/modeler/solvers/z3/index.ts"));
        if (!z3Mod.isZ3Loaded()) {
          const hasExplicitZ3Urls = Boolean(solveOptions.z3JsUrl || solveOptions.z3WasmUrl);
          if (typeof window !== "undefined" && !z3AssetsConfigured && !hasExplicitZ3Urls) {
            z3Mod.setZ3Assets({
              jsUrl: new URL("/z3-built.js", window.location.origin).href,
              wasmUrl: new URL("/z3-built.wasm", window.location.origin).href,
            });
            z3AssetsConfigured = true;
          }
          await measureSolverLoad(() => z3Mod.loadZ3(solveOptions));
          didLoad = true;
        }
      } else if (solverName === "glpk") {
        const glpkMod =
          cachedGlpkMod ??
          (cachedGlpkMod = await import("../../../../src/modeler/solvers/glpk/index.ts"));
        if (!glpkMod.isGlpkLoaded()) {
          await measureSolverLoad(() => glpkMod.getGlpk());
          didLoad = true;
        }
      }
    };

    const trackOperation = <T>(
      modelInstance: InstanceType<typeof Modeler.Model>,
      args: [Solver | string | SolveOptions | undefined, SolveOptions | undefined],
      run: () => Promise<T>
    ): Promise<T> => {
      const p = (async () => {
        await warmSolverForCall(modelInstance.solver, args[0], args[1]);
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

    emitPhase("running");
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
