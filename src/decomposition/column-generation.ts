import type {
  ColumnGenerationOptions,
  ColumnGenerationResult,
  ColumnProposal,
  PricingContext,
} from "./types.js";
import type { Constraint } from "../modeler/constraint.js";
import type { Var } from "../modeler/variable.js";
import type { Model } from "../modeler/model.js";

/**
 * Solve a problem using Column Generation (Dantzig-Wolfe decomposition).
 *
 * Column Generation starts with a Restricted Master Problem (RMP) containing a small set of initial columns,
 * repeatedly solves its continuous LP relaxation to obtain dual values (shadow prices), and calls a user-provided
 * `pricing` subproblem callback to identify new columns with improving reduced costs.
 * Once no improving columns exist, it optionally solves the master as a Mixed-Integer Program (MIP)
 * to produce an integer solution.
 *
 * @param options Column generation options including master model and pricing callback
 * @returns Result object containing status, objective, iterations, columns added, and final variable values
 *
 * @example
 * ```ts
 * const result = await master.solveColumnGeneration({
 *   pricing: async () => {
 *     const sub = new Model("Pricing");
 *     const a = sub.integer("a", { lb: 0, ub: 2 });
 *     sub.objective(maximize(expr`${(demandA.dual ?? 0)} * ${a}`));
 *     sub.constraint(expr`45 * ${a} <= 100`);
 *     await sub.solve();
 *     return {
 *       cost: 1,
 *       type: "Integer",
 *       coefficients: { demand_A: a.value ?? 0 },
 *     };
 *   },
 *   finalizeAsMIP: true,
 * });
 * ```
 */
export async function solveColumnGeneration<TColumnMeta = unknown>(
  options: ColumnGenerationOptions<TColumnMeta>
): Promise<ColumnGenerationResult<TColumnMeta>> {
  const master = options.master;
  if (!master) {
    throw new Error("A master Model must be provided for solveColumnGeneration.");
  }

  const {
    pricing,
    maxIterations = 100,
    reducedCostTolerance = 1e-6,
    finalizeAsMIP = true,
    solver,
    solverOptions,
    onIteration,
  } = options;

  const isMaximize = master.sense.toLowerCase() === "maximize";

  const pricingFn = pricing;
  if (!pricingFn) {
    throw new Error(
      "The 'pricing' callback must be provided in ColumnGenerationOptions."
    );
  }

  const generatedColumns: Array<{
    variable: Var;
    proposal: ColumnProposal<TColumnMeta>;
  }> = [];

  let relaxationObjectiveValue: number | null = null;
  let iterations = 0;
  let lastStatus = master.status;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;

    // 1. Solve Restricted Master Problem (RMP) continuous LP relaxation
    const status = await master.relax(solver, solverOptions);
    lastStatus = status;

    if ((status !== "Optimal" && status !== "Feasible") || !master.solution) {
      // If RMP relaxation is infeasible or errored, stop early
      break;
    }

    relaxationObjectiveValue = master.objectiveValue;
    const masterSol = master.solution;
    const duals = masterSol.duals || {};

    const getDual = (constraintOrName: Constraint | string): number => {
      if (typeof constraintOrName === "string") {
        return duals[constraintOrName] ?? 0;
      }
      return constraintOrName.dual ?? (constraintOrName.name ? duals[constraintOrName.name] ?? 0 : 0);
    };

    const pricingContext: PricingContext<TColumnMeta> = {
      iteration: iter,
      duals,
      getDual,
      masterSolution: masterSol,
      reducedCostTolerance,
      master,
    };

    // 2. Call pricing subproblem
    const proposalOrProposals = await pricingFn(pricingContext);

    const proposals: Array<ColumnProposal<TColumnMeta>> = [];
    if (proposalOrProposals) {
      if (Array.isArray(proposalOrProposals)) {
        proposals.push(...proposalOrProposals);
      } else {
        proposals.push(proposalOrProposals);
      }
    }

    // 3. Filter proposals by improving reduced cost
    const improvingProposals: Array<ColumnProposal<TColumnMeta>> = [];
    for (const proposal of proposals) {
      let rc = proposal.reducedCost;

      // If reducedCost is not explicitly provided, calculate it: rc = cost - sum(pi_i * a_i)
      if (typeof rc !== "number" || !Number.isFinite(rc)) {
        let dualContrib = 0;
        const coeffs = proposal.coefficients;
        if (Array.isArray(coeffs)) {
          for (const item of coeffs) {
            if (Array.isArray(item)) {
              dualContrib += item[1] * getDual(item[0]);
            } else if (item && typeof item === "object") {
              dualContrib += item.coeff * getDual(item.constraint);
            }
          }
        } else if (coeffs instanceof Map) {
          for (const [c, coeff] of coeffs.entries()) {
            dualContrib += coeff * getDual(c);
          }
        } else if (coeffs && typeof coeffs === "object") {
          for (const [cName, coeff] of Object.entries(coeffs)) {
            dualContrib += coeff * getDual(cName);
          }
        }
        rc = proposal.cost - dualContrib;
      }

      const isImproving = isMaximize
        ? rc > reducedCostTolerance
        : rc < -reducedCostTolerance;

      if (isImproving) {
        improvingProposals.push(proposal);
      }
    }

    if (onIteration) {
      onIteration({
        iteration: iter,
        relaxationObjective: relaxationObjectiveValue,
        columnsAdded: generatedColumns.length + improvingProposals.length,
        proposedColumns: improvingProposals,
      });
    }

    // 4. Terminate if no improving columns found
    if (improvingProposals.length === 0) {
      break;
    }

    // 5. Inject new columns into the master model
    for (const proposal of improvingProposals) {
      const colVar = master.addColumn({
        name: proposal.name,
        type: proposal.type || "Continuous",
        lb: proposal.lb,
        ub: proposal.ub,
        cost: proposal.cost,
        coefficients: proposal.coefficients,
      });
      generatedColumns.push({ variable: colVar, proposal });
    }
  }

  // 6. Optionally finalize as MIP
  let finalObjective = relaxationObjectiveValue;
  if (finalizeAsMIP && (lastStatus === "Optimal" || lastStatus === "Feasible")) {
    const mipStatus = await master.solve(solver, solverOptions);
    lastStatus = mipStatus;
    finalObjective = master.objectiveValue;
  }

  const values: Record<string, number> = {};
  for (const v of master.variables) {
    if (v.value !== null) {
      values[v.name] = v.value;
    }
  }

  const result: ColumnGenerationResult<TColumnMeta> = {
    status: lastStatus,
    objectiveValue: finalObjective,
    relaxationObjectiveValue,
    iterations,
    columnsAdded: generatedColumns.length,
    generatedColumns,
    master,
    values,
  };

  (master as any).decomposition = result;
  return result;
}
