import type {
  BendersCut,
  BendersOptions,
  BendersResult,
  BendersSubproblemContext,
} from "./types.js";
import type { Var } from "../modeler/variable.js";
import { Constraint } from "../modeler/constraint.js";

/**
 * Solve a problem using Benders Decomposition.
 *
 * Benders Decomposition partitions a problem into a Master Problem (containing complicating variables,
 * such as discrete binary/integer design decisions, and an auxiliary objective estimator variable)
 * and a Subproblem (typically a continuous LP or independent operational model).
 *
 * The master problem is solved iteratively, passing its tentative decision values to the subproblem callback.
 * The subproblem callback evaluates feasibility and optimality, returning Benders Optimality Cuts or
 * Feasibility Cuts to be dynamically added to the master until bounds converge.
 *
 * @param options Benders options including master model and subproblem callback
 * @returns Result object containing status, objective, bounds, gap, iterations, and variable values
 *
 * @example
 * ```ts
 * const result = await solveBenders({
 *   master,
 *   subproblem: async ({ getMasterValue }) => {
 *     const facilityOpen = getMasterValue(openVar);
 *     // Solve operational subproblem with fixed facilityOpen
 *     // Return optimality cut if operational cost > theta, or null when converged
 *   },
 *   gapTolerance: 1e-4,
 * });
 * ```
 */
export async function solveBenders(
  options: BendersOptions
): Promise<BendersResult> {
  const {
    master,
    subproblem,
    maxIterations = 100,
    gapTolerance = 1e-4,
    solver,
    solverOptions,
    onIteration,
  } = options;

  let cutsAdded = 0;
  let iterations = 0;
  let lastStatus = master.status;
  let lowerBound: number | undefined;
  let upperBound: number | undefined;
  let currentGap: number | undefined;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;

    // 1. Solve the master problem
    const status = await master.solve(solver, solverOptions);
    lastStatus = status;

    if (status !== "Optimal" && status !== "Feasible") {
      break;
    }

    const masterObj = master.objectiveValue;
    const isMinimize = master.sense.toLowerCase() === "minimize";

    if (isMinimize) {
      lowerBound = masterObj !== null ? masterObj : lowerBound;
    } else {
      upperBound = masterObj !== null ? masterObj : upperBound;
    }

    // Extract master variable values
    const masterValues: Record<string, number> = {};
    for (const v of master.variables) {
      if (v.value !== null) {
        masterValues[v.name] = v.value;
      }
    }

    const getMasterValue = (vOrName: Var | string): number => {
      if (typeof vOrName === "string") {
        return masterValues[vOrName] ?? 0;
      }
      return vOrName.value ?? (vOrName.name ? masterValues[vOrName.name] ?? 0 : 0);
    };

    const context: BendersSubproblemContext = {
      iteration: iter,
      masterValues,
      getMasterValue,
      masterObjective: masterObj,
      lowerBound,
      upperBound,
      master,
    };

    // 2. Evaluate the subproblem
    const cutOrCuts = await subproblem(context);
    const cuts: BendersCut[] = [];
    if (cutOrCuts) {
      if (Array.isArray(cutOrCuts)) {
        cuts.push(...cutOrCuts);
      } else {
        cuts.push(cutOrCuts);
      }
    }

    // Update bounds from subproblem objective if available
    for (const cut of cuts) {
      if (typeof cut.subproblemObjective === "number" && Number.isFinite(cut.subproblemObjective)) {
        if (isMinimize) {
          const candidateUB = cut.subproblemObjective;
          upperBound = upperBound === undefined ? candidateUB : Math.min(upperBound, candidateUB);
        } else {
          const candidateLB = cut.subproblemObjective;
          lowerBound = lowerBound === undefined ? candidateLB : Math.max(lowerBound, candidateLB);
        }
      }
    }

    if (lowerBound !== undefined && upperBound !== undefined) {
      const denom = Math.abs(upperBound) + 1e-10;
      currentGap = Math.abs(upperBound - lowerBound) / denom;
    }

    if (onIteration) {
      onIteration({
        iteration: iter,
        masterObjective: masterObj,
        lowerBound,
        upperBound,
        cutsAdded: cutsAdded + cuts.length,
        proposedCuts: cuts,
      });
    }

    // 3. If no cuts are generated or optimality gap is within tolerance, we are done
    if (cuts.length === 0) {
      break;
    }

    if (currentGap !== undefined && currentGap <= gapTolerance) {
      break;
    }

    // 4. Add cuts to the master model
    for (const cut of cuts) {
      if (cut.constraint instanceof Constraint) {
        master.constraint(cut.constraint);
      } else {
        master.constraint(cut.constraint, cut.name);
      }
      cutsAdded++;
    }
  }

  const values: Record<string, number> = {};
  for (const v of master.variables) {
    if (v.value !== null) {
      values[v.name] = v.value;
    }
  }

  return {
    status: lastStatus,
    objectiveValue: master.objectiveValue,
    lowerBound,
    upperBound,
    gap: currentGap,
    iterations,
    cutsAdded,
    master,
    values,
  };
}
