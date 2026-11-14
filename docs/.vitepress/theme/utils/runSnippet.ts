import { transpileSnippetToJs } from "./transpile";

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
  const mayNeedLoad =
    !cachedModeler ||
    (needsHighs && !highsWarmed) ||
    (needsZ3 && (!cachedZ3Mod || !cachedZ3Mod.isZ3Loaded())) ||
    (needsGlpk && (!cachedGlpkMod || !cachedGlpkMod.isGlpkLoaded()));

  let didLoad = false;
  let loadTimeMs = 0;
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
      if (typeof window !== "undefined" && !z3AssetsConfigured) {
        cachedZ3Mod.setZ3Assets({
          jsUrl: new URL("/z3-built.js", window.location.origin).href,
          wasmUrl: new URL("/z3-built.wasm", window.location.origin).href,
        });
        z3AssetsConfigured = true;
      }
      if (!cachedZ3Mod.isZ3Loaded()) {
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

    if (needsHighs) {
      const { warmupHighs } = await import("../../../../src/modeler/solvers/highs/worker-client.ts");
      const { cached } = await warmupHighs();
      if (!cached) {
        didLoad = true;
      }
      highsWarmed = true;
    }

    loadTimeMs = didLoad ? performance.now() - loadStart : 0;

    const pendingPromises: Promise<unknown>[] = [];

    class TrackedModel extends Modeler.Model {
      override solve(...args: Parameters<InstanceType<typeof Modeler.Model>["solve"]>) {
        const p = super.solve(...args).then((res) => {
          solveCalls++;
          totalSolveTimeSec += Number.isFinite(this.runTime) ? this.runTime : 0;
          return res;
        });
        pendingPromises.push(p);
        return p;
      }
      override check(...args: Parameters<InstanceType<typeof Modeler.Model>["check"]>) {
        const p = super.check(...args).then((res) => {
          solveCalls++;
          totalSolveTimeSec += Number.isFinite(this.runTime) ? this.runTime : 0;
          return res;
        });
        pendingPromises.push(p);
        return p;
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

    const runTimeMs = performance.now() - execStart;
    return {
      logs: capturedLogs,
      errorMsg: null,
      loadTimeMs,
      solveTimeMs: solveCalls > 0 ? totalSolveTimeSec * 1000 : null,
      runTimeMs,
      wasCached: !didLoad,
    };
  } catch (err: unknown) {
    const now = performance.now();
    return {
      logs: capturedLogs,
      errorMsg: err instanceof Error ? err.message : String(err),
      loadTimeMs: execStart === null ? now - loadStart : loadTimeMs,
      solveTimeMs: solveCalls > 0 ? totalSolveTimeSec * 1000 : null,
      runTimeMs: execStart === null ? 0 : now - execStart,
      wasCached: !didLoad,
    };
  }
}
