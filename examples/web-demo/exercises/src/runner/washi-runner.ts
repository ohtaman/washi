import * as Modeler from "../../../../../src/index.js";
import {
  PumpkinSolver,
  registerPumpkinSolver,
  setPumpkinWasmUrl,
} from "../../../../../src/modeler/solvers/pumpkin.js";
import { GLPKSolver, registerGLPKSolver } from "../../../../../src/modeler/solvers/glpk.js";
import {
  Z3Solver,
  registerZ3Solver,
  setZ3Assets,
} from "../../../../../src/modeler/solvers/z3.js";
import { transpileExerciseTsToJs } from "./ts-transpile.js";

registerPumpkinSolver();
registerGLPKSolver();
registerZ3Solver();

let wasmConfigured = false;

export function configureWashiExerciseWasmUrls(): void {
  if (wasmConfigured || typeof window === "undefined") return;
  wasmConfigured = true;

  const isDev = Boolean(
    typeof import.meta !== "undefined" &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV
  );

  if (isDev) {
    Modeler.setHighsWasmUrl(new URL("/highs.wasm", window.location.origin).href);
    setPumpkinWasmUrl(new URL("/pumpkin.wasm", window.location.origin).href);
    setZ3Assets({
      jsUrl: new URL("/z3-built.js", window.location.origin).href,
      wasmUrl: new URL("/z3-built.wasm", window.location.origin).href,
    });
  } else {
    Modeler.setHighsWasmUrl(new URL("../highs.wasm", window.location.href).href);
    setPumpkinWasmUrl(new URL("../pumpkin.wasm", window.location.href).href);
    setZ3Assets({
      jsUrl: new URL("../z3-built.js", window.location.href).href,
      wasmUrl: new URL("../z3-built.wasm", window.location.href).href,
    });
  }
}

export interface ExerciseCaseMetrics {
  varCount: number;
  constraintCount: number;
  solveTimeMs: number | null;
}

export interface WashiExerciseRunResult {
  ok: boolean;
  logs: string[];
  outputs: unknown[];
  metrics: ExerciseCaseMetrics[];
  lpPreview: string | null;
  error?: string;
  runTimeMs: number;
}

function cloneFallbackWithCycles(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (Array.isArray(value)) {
    const arrCopy: unknown[] = [];
    seen.set(value, arrCopy);
    for (let i = 0; i < value.length; i++) {
      arrCopy.push(cloneFallbackWithCycles(value[i], seen));
    }
    return arrCopy;
  }
  if (ArrayBuffer.isView(value)) {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  const objCopy: Record<string, unknown> = {};
  seen.set(value, objCopy);
  for (const [k, v] of Object.entries(value)) {
    objCopy[k] = typeof v === "function" ? v : cloneFallbackWithCycles(v, seen);
  }
  return objCopy;
}

function snapshotCaseOutput(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return cloneFallbackWithCycles(value, new WeakMap<object, unknown>());
  }
}

function formatLogArg(arg: unknown): string {
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
 * Compile and run the user's TypeScript/JavaScript `solve(input)` implementation
 * against every test case input using WaSHI's live WebAssembly solvers.
 */
export async function runWashiExerciseCode(
  rawCode: string,
  inputs: unknown[]
): Promise<WashiExerciseRunResult> {
  configureWashiExerciseWasmUrls();

  const logs: string[] = [];
  const customConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatLogArg).join(" ")),
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(formatLogArg).join(" ")}`),
    error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(formatLogArg).join(" ")}`),
  };

  let createdModels: Modeler.Model[] = [];

  class TrackedModel extends Modeler.Model {
    constructor(...args: ConstructorParameters<typeof Modeler.Model>) {
      super(...args);
      createdModels.push(this);
    }
  }

  const context: Record<string, unknown> = {
    ...Modeler,
    PumpkinSolver,
    GLPKSolver,
    Z3Solver,
    Model: TrackedModel,
    console: customConsole,
  };

  const startMs = performance.now();

  try {
    const jsCode = transpileExerciseTsToJs(rawCode);
    const keys = Object.keys(context);
    const values = Object.values(context);

    const factory = new Function(
      ...keys,
      `"use strict";\n${jsCode}\nreturn typeof solve === "function" ? solve : null;`
    );
    const solveFn = factory(...values);
    if (typeof solveFn !== "function") {
      throw new Error('Could not find function `solve(input)`. Export `async function solve(input)`.');
    }

    const outputs: unknown[] = [];
    const metrics: ExerciseCaseMetrics[] = [];
    let firstLpPreview: string | null = null;

    for (let i = 0; i < inputs.length; i++) {
      createdModels = [];
      const clonedInput = structuredClone(inputs[i]);
      const out = await solveFn(clonedInput);
      outputs.push(snapshotCaseOutput(out));

      const primary = createdModels[createdModels.length - 1];
      if (primary) {
        if (firstLpPreview === null && i === 0) {
          try {
            firstLpPreview = primary.toLpString();
          } catch {
            firstLpPreview = null;
          }
        }
        metrics.push({
          varCount: primary.variables.size,
          constraintCount: primary.constraints.size,
          solveTimeMs: Number.isFinite(primary.runTime) ? primary.runTime * 1000 : null,
        });
      } else {
        metrics.push({ varCount: 0, constraintCount: 0, solveTimeMs: null });
      }
    }

    return {
      ok: true,
      logs,
      outputs,
      metrics,
      lpPreview: firstLpPreview,
      runTimeMs: Math.max(0, performance.now() - startMs),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      logs,
      outputs: [],
      metrics: [],
      lpPreview: null,
      error: err instanceof Error ? err.message : String(err),
      runTimeMs: Math.max(0, performance.now() - startMs),
    };
  }
}
