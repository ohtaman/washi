import type {
  BendersCut,
  BendersOptions,
  BendersResult,
  BendersSubproblemContext,
} from "./types.js";
import type { Model } from "../modeler/model.js";
import type { Var } from "../modeler/variable.js";
import type { Solver, SolverOptions } from "../modeler/solvers/index.js";
import { LinExpr } from "../modeler/expression.js";
import { Constraint } from "../modeler/constraint.js";
import { minimize, maximize } from "../modeler/objective.js";

function isModelLike(val: unknown): val is Model {
  return Boolean(
    val &&
    typeof val === "object" &&
    "constraints" in val &&
    "variables" in val &&
    typeof (val as Model).solve === "function"
  );
}

async function generateBendersCutFromSubproblem(
  subModel: Model,
  rawLinking: ReadonlyArray<Constraint>,
  master: Model,
  thetaVar: Var,
  masterValues: Record<string, number>,
  isMinimize: boolean,
  solver?: Solver | string,
  solverOptions?: SolverOptions,
  iterationIndex = 1
): Promise<BendersCut | null> {
  interface LinkingMeta {
    origConstraint: Constraint;
    subConstr: Constraint;
    masterTerms: Array<[Var, number]>;
    baseRhs: number;
  }

  const processedLinking: LinkingMeta[] = [];

  for (let idx = 0; idx < rawLinking.length; idx++) {
    const origConstr = rawLinking[idx];
    const lhs = origConstr.lhs;
    const sense = origConstr.sense;
    const rhsConst = origConstr.rhs - (lhs.constant || 0);

    const subTerms: Array<[Var, number]> = [];
    const masterTerms: Array<[Var, number]> = [];
    let masterFixedSum = 0;

    for (const [v, coeff] of lhs.terms.entries()) {
      const isMasterVar = v.ownerModel === master || master.getVarByName(v.name) !== undefined;
      if (isMasterVar) {
        masterTerms.push([v, coeff]);
        const mVal = masterValues[v.name] ?? 0;
        masterFixedSum += coeff * mVal;
      } else {
        subTerms.push([v, coeff]);
      }
    }

    const subRhs = rhsConst - masterFixedSum;
    const subLhs = new LinExpr();
    for (const [sv, coeff] of subTerms) {
      subLhs.addTerm(sv, coeff);
    }

    const subConstrName = `__benders_link_${iterationIndex}_${idx}`;
    const subConstr = new Constraint(subLhs, sense, subRhs, subConstrName);
    subModel.constraint(subConstr);
    processedLinking.push({
      origConstraint: origConstr,
      subConstr,
      masterTerms,
      baseRhs: rhsConst,
    });
  }

  // Solve subproblem as continuous LP
  const subStatus = await subModel.solve(solver, { ...solverOptions, relax: true });
  if (subStatus !== "Optimal" && subStatus !== "Feasible") {
    return null;
  }

  const subObj = subModel.objectiveValue ?? 0;
  const currentThetaVal = masterValues[thetaVar.name] ?? 0;

  const tolerance = 1e-4;
  const needsCut = isMinimize
    ? currentThetaVal < subObj - tolerance
    : currentThetaVal > subObj + tolerance;

  if (!needsCut) {
    return null;
  }

  // Construct Benders cut
  let cutConstantRhs = 0;
  const masterCutCoeffs = new Map<Var, number>();

  const linkingSubConstrNames = new Set(processedLinking.map((p) => p.subConstr.name));
  for (const c of subModel.constraints) {
    if (linkingSubConstrNames.has(c.name)) continue;
    const dual = subModel.solution?.duals[c.name] ?? c.dual ?? 0;
    if (Math.abs(dual) > 1e-12) {
      const rhsConst = c.rhs - (c.lhs.constant || 0);
      cutConstantRhs += dual * rhsConst;
    }
  }

  for (const p of processedLinking) {
    const dual = subModel.solution?.duals[p.subConstr.name] ?? p.subConstr.dual ?? 0;
    if (Math.abs(dual) > 1e-12) {
      cutConstantRhs += dual * p.baseRhs;
      for (const [mVar, coeff] of p.masterTerms) {
        const currentCoeff = masterCutCoeffs.get(mVar) ?? 0;
        masterCutCoeffs.set(mVar, currentCoeff + dual * coeff);
      }
    }
  }

  const cutLhs = new LinExpr();
  cutLhs.addTerm(thetaVar, 1);
  for (const [mVar, coeff] of masterCutCoeffs.entries()) {
    if (Math.abs(coeff) > 1e-12) {
      cutLhs.addTerm(mVar, coeff);
    }
  }

  const cutConstraint = new Constraint(
    cutLhs,
    isMinimize ? ">=" : "<=",
    cutConstantRhs,
    `__benders_opt_cut_${iterationIndex}`
  );

  const masterDirectCost = (master.objectiveValue ?? 0) - currentThetaVal;
  const totalEvaluatedObj = masterDirectCost + subObj;

  return {
    kind: "optimality",
    constraint: cutConstraint,
    name: cutConstraint.name,
    subproblemObjective: totalEvaluatedObj,
  };
}

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
 * const result = await master.solveBenders({
 *   subproblem: () => {
 *     const sub = new Model("OperationalSub");
 *     const x = sub.continuous("x", { lb: 0 });
 *     sub.objective(minimize(expr`2 * ${x}`));
 *     sub.constraint(expr`${x} >= 30`, "demand");
 *     sub.link(expr`${x} <= 50 * ${openVar}`);
 *     return sub;
 *   },
 *   gapTolerance: 1e-4,
 * });
 * ```
 */
export async function solveBenders(
  options: BendersOptions
): Promise<BendersResult> {
  const master = options.master;
  if (!master) {
    throw new Error("A master Model must be provided for solveBenders.");
  }

  const {
    subproblem,
    maxIterations = 100,
    gapTolerance = 1e-4,
    solver,
    solverOptions,
    onIteration,
  } = options;

  let thetaVar: Var | undefined;
  if (options.theta) {
    thetaVar = typeof options.theta === "string" ? master.getVarByName(options.theta) : options.theta;
  }
  if (!thetaVar) {
    thetaVar = master.variables.find((v) => v.name === "theta" || v.name === "__benders_theta");
  }

  let cutsAdded = 0;
  let iterations = 0;
  let lastStatus = master.status;
  let lowerBound: number | undefined;
  let upperBound: number | undefined;
  let currentGap: number | undefined;
  let bestIncumbentValues: Record<string, number> = {};
  let bestEvaluatedObjective: number | null = null;

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
    const rawSubOutput = await subproblem(context);
    const cuts: BendersCut[] = [];

    if (rawSubOutput) {
      if (isModelLike(rawSubOutput)) {
        // Automatic Benders cut generation from subproblem Model!
        const subModel: Model = rawSubOutput;
        const rawLinking = subModel.linkingConstraints;

        if (!thetaVar) {
          thetaVar = master.continuous("__benders_theta", { lb: 0 });
          if (isMinimize) {
            master.objective(minimize(master.objectiveExpr.add(thetaVar)));
          } else {
            master.objective(maximize(master.objectiveExpr.sub(thetaVar)));
          }
        }

        const autoCut = await generateBendersCutFromSubproblem(
          subModel,
          rawLinking,
          master,
          thetaVar,
          masterValues,
          isMinimize,
          solver,
          solverOptions,
          iter
        );
        if (autoCut) {
          cuts.push(autoCut);
        }
      } else if (Array.isArray(rawSubOutput)) {
        cuts.push(...rawSubOutput);
      } else {
        cuts.push(rawSubOutput);
      }
    }

    // Update bounds and track the incumbent solution associated with the best evaluated objective
    for (const cut of cuts) {
      if (typeof cut.subproblemObjective === "number" && Number.isFinite(cut.subproblemObjective)) {
        if (isMinimize) {
          const candidateUB = cut.subproblemObjective;
          if (upperBound === undefined || candidateUB < upperBound) {
            upperBound = candidateUB;
            bestEvaluatedObjective = candidateUB;
            bestIncumbentValues = { ...masterValues };
          }
        } else {
          const candidateLB = cut.subproblemObjective;
          if (lowerBound === undefined || candidateLB > lowerBound) {
            lowerBound = candidateLB;
            bestEvaluatedObjective = candidateLB;
            bestIncumbentValues = { ...masterValues };
          }
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
      // Current master solution is optimal
      bestEvaluatedObjective = masterObj;
      bestIncumbentValues = { ...masterValues };
      break;
    }

    if (currentGap !== undefined && currentGap <= gapTolerance) {
      break;
    }

    // 4. Add cuts to the master model
    for (const cut of cuts) {
      master.constraint(cut.constraint, cut.name);
      cutsAdded++;
    }
  }

  // Use the best incumbent values associated with the converged bound, falling back to final master state
  const values: Record<string, number> =
    Object.keys(bestIncumbentValues).length > 0
      ? bestIncumbentValues
      : (() => {
          const rec: Record<string, number> = {};
          for (const v of master.variables) {
            if (v.value !== null) {
              rec[v.name] = v.value;
            }
          }
          return rec;
        })();

  // The evaluated incumbent values are returned in result.values.
  // We keep the solved master model state separate and internally consistent with its final solve.
  const finalObjective =
    bestEvaluatedObjective !== null ? bestEvaluatedObjective : master.objectiveValue;

  const result: BendersResult = {
    status: lastStatus,
    objectiveValue: finalObjective,
    lowerBound,
    upperBound,
    gap: currentGap,
    iterations,
    cutsAdded,
    master,
    values,
  };

  (master as any).decomposition = result;
  return result;
}
