import { transpileSnippetToJs } from "./transpile";

export interface SnippetRunResult {
  logs: string[];
  errorMsg: string | null;
  runTimeMs: number;
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

/**
 * Transpiles and executes a WaSHI documentation TypeScript/JavaScript snippet
 * in-process against the live WebAssembly modeler with an isolated lexical
 * `console` binding so solver engine stdout banners never pollute snippet output.
 */
export async function runWashiSnippet(rawCode: string): Promise<SnippetRunResult> {
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

  const t0 = performance.now();
  try {
    const Modeler = await import("../../../../src/index.ts");
    if (rawCode.includes("z3")) {
      const z3Mod = await import("../../../../src/modeler/solvers/z3/index.ts");
      if (typeof window !== "undefined") {
        z3Mod.setZ3Assets({
          jsUrl: new URL("/washi/z3-built.js", window.location.origin).href,
          wasmUrl: new URL("/washi/z3-built.wasm", window.location.origin).href,
        });
      }
    }
    if (rawCode.includes("glpk")) {
      await import("../../../../src/modeler/solvers/glpk/index.ts");
    }

    const pendingPromises: Promise<unknown>[] = [];

    class TrackedModel extends Modeler.Model {
      override solve(...args: Parameters<InstanceType<typeof Modeler.Model>["solve"]>) {
        const p = super.solve(...args);
        pendingPromises.push(p);
        return p;
      }
      override check(...args: Parameters<InstanceType<typeof Modeler.Model>["check"]>) {
        const p = super.check(...args);
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

    const execStart = performance.now();
    const fn = new Function(...keys, `return (async () => {\n${jsCode}\n})();`);
    await fn(...values);
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    return {
      logs: capturedLogs,
      errorMsg: null,
      runTimeMs: performance.now() - execStart,
    };
  } catch (err: unknown) {
    return {
      logs: capturedLogs,
      errorMsg: err instanceof Error ? err.message : String(err),
      runTimeMs: performance.now() - t0,
    };
  }
}
