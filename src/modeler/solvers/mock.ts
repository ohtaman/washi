import type {
  Solver,
  SolverOptions,
  SolverResult,
  SolverCapabilities,
  SolveModelData,
} from "./types.js";
import { isLpExportResult, type LpModelData, type LpExportResult } from "../lp-writer.js";
import type { SolverStatus, TerminationStatus, SolveProgressEvent } from "../types.js";

export interface MockSolverOptions extends SolverOptions {
  name?: string;
  capabilities?: SolverCapabilities;
  status?: SolverStatus;
  terminationStatus?: TerminationStatus;
  hasPrimalSolution?: boolean;
  objectiveValue?: number | null;
  objectiveBound?: number;
  relGap?: number;
  mipGap?: number;
  absGap?: number;
  values?: Record<string, number>;
  boolValues?: Record<string, boolean>;
  reducedCosts?: Record<string, number>;
  duals?: Record<string, number>;
  slacks?: Record<string, number>;
  delayMs?: number;
  progressEvents?: SolveProgressEvent[];
}

/**
 * Mock / Dummy Solver for deterministic testing, CI/CD, or offline usage without WASM.
 */
export class MockSolver implements Solver {
  public readonly name: string;
  public readonly capabilities: SolverCapabilities;
  public options: MockSolverOptions;

  constructor(options: MockSolverOptions = {}) {
    this.name = options.name || "MockSolver";
    this.capabilities = options.capabilities || {
      supportsMIP: true,
      supportsQP: true,
      supportsWarmStart: true,
    };
    this.options = options;
  }

  solve(modelData: SolveModelData, options?: SolverOptions): Promise<SolverResult>;
  solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options?: SolverOptions
  ): Promise<SolverResult>;
  async solve(
    _modelData: SolveModelData,
    optionsOrLpResult: SolverOptions | LpExportResult = {},
    maybeOptions: SolverOptions = {}
  ): Promise<SolverResult> {
    const options: SolverOptions = isLpExportResult(optionsOrLpResult)
      ? maybeOptions
      : optionsOrLpResult;
    const opts: MockSolverOptions = { ...this.options, ...options };
    const hasConfiguredIncumbent = Boolean(
      (opts.values && Object.keys(opts.values).length > 0) ||
        (opts.boolValues && Object.keys(opts.boolValues).length > 0)
    );
    if (opts.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: 0,
        raw: { mock: true },
      };
    }

    if (opts.delayMs && opts.delayMs > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          opts.signal?.removeEventListener("abort", onAbort);
          resolve();
        }, opts.delayMs);
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
      });
      if (opts.signal?.aborted) {
        const hasIncumbent = Boolean(opts.hasPrimalSolution ?? hasConfiguredIncumbent);
        return {
          status: hasIncumbent ? "Feasible" : "Unknown",
          terminationStatus: "Interrupted",
          hasPrimalSolution: hasIncumbent,
          objectiveValue: hasIncumbent ? (opts.objectiveValue ?? 0) : null,
          ...(opts.objectiveBound !== undefined ? { objectiveBound: opts.objectiveBound } : {}),
          ...(opts.relGap !== undefined
            ? { relGap: opts.relGap, mipGap: opts.relGap }
            : opts.mipGap !== undefined
              ? { relGap: opts.mipGap, mipGap: opts.mipGap }
              : {}),
          ...(opts.absGap !== undefined ? { absGap: opts.absGap } : {}),
          values: hasIncumbent ? opts.values || {} : {},
          ...(hasIncumbent && opts.boolValues !== undefined ? { boolValues: opts.boolValues } : {}),
          runTime: 0.001,
          raw: { mock: true },
        };
      }
    }

    if (opts.onProgress && Array.isArray(opts.progressEvents)) {
      for (const ev of opts.progressEvents) {
        if (opts.signal?.aborted) break;
        opts.onProgress(ev);
      }
    }

    let status = opts.status || "Optimal";
    let terminationStatus = opts.terminationStatus ?? status;
    let hasPrimalSolution =
      opts.hasPrimalSolution !== undefined
        ? opts.hasPrimalSolution
        : status === "Optimal" ||
          status === "Feasible" ||
          status === "Sat" ||
          ((status === "TimeLimit" || status === "IterationLimit" || terminationStatus === "Interrupted") &&
            hasConfiguredIncumbent);

    if (opts.onProgress && !Array.isArray(opts.progressEvents) && !opts.signal?.aborted) {
      const obj = hasPrimalSolution ? (opts.objectiveValue ?? 0) : undefined;
      opts.onProgress({
        elapsedTime: 0.001,
        elapsedSeconds: 0.001,
        ...(typeof obj === "number" && Number.isFinite(obj) ? { objectiveValue: obj } : {}),
        ...(opts.objectiveBound !== undefined ? { objectiveBound: opts.objectiveBound } : {}),
        ...(opts.relGap !== undefined
          ? { relGap: opts.relGap, mipGap: opts.relGap }
          : opts.mipGap !== undefined
            ? { relGap: opts.mipGap, mipGap: opts.mipGap }
            : {}),
        ...(opts.absGap !== undefined ? { absGap: opts.absGap } : {}),
      });
    }

    if (opts.signal?.aborted) {
      terminationStatus = "Interrupted";
      hasPrimalSolution =
        opts.hasPrimalSolution !== undefined
          ? opts.hasPrimalSolution
          : hasConfiguredIncumbent;
      status = hasPrimalSolution ? "Feasible" : "Unknown";
    }

    return {
      status,
      terminationStatus,
      hasPrimalSolution,
      objectiveValue: hasPrimalSolution ? (opts.objectiveValue ?? 0) : null,
      ...(opts.objectiveBound !== undefined ? { objectiveBound: opts.objectiveBound } : {}),
      ...(opts.relGap !== undefined
        ? { relGap: opts.relGap, mipGap: opts.relGap }
        : opts.mipGap !== undefined
          ? { relGap: opts.mipGap, mipGap: opts.mipGap }
          : {}),
      ...(opts.absGap !== undefined ? { absGap: opts.absGap } : {}),
      values: hasPrimalSolution ? opts.values || {} : {},
      ...(hasPrimalSolution && opts.boolValues !== undefined ? { boolValues: opts.boolValues } : {}),
      reducedCosts: opts.reducedCosts,
      duals: opts.duals,
      slacks: opts.slacks,
      runTime: 0.001,
      raw: { mock: true },
    };
  }
}

import { registerSolver } from "./registry.js";
export function registerMockSolver(): void {
  registerSolver("mock", (opts) => new MockSolver(opts));
}
registerMockSolver();

