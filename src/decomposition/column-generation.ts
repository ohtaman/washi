import type {
  ColumnGenerationOptions,
  ColumnGenerationResult,
  ColumnProposal,
  PricingContext,
  DeclarativeSubproblem,
} from "./types.js";
import type { Constraint } from "../modeler/constraint.js";
import type { Var } from "../modeler/variable.js";
import type { Model } from "../modeler/model.js";
import type { Solver, SolverOptions } from "../modeler/solvers/index.js";
import { minimize, maximize } from "../modeler/objective.js";
import { LinExpr } from "../modeler/expression.js";

function isModelLike(val: unknown): val is Model {
  return Boolean(
    val &&
      typeof val === "object" &&
      "constraints" in val &&
      "variables" in val &&
      "columnLink" in val &&
      typeof (val as { solve?: unknown }).solve === "function"
  );
}

function createPricingFromDeclarativeSubproblem<TColumnMeta = unknown>(
  subDef: DeclarativeSubproblem<TColumnMeta>,
  isMasterMaximize: boolean,
  defaultSolver?: Solver | string,
  defaultSolverOptions?: SolverOptions
): (context: PricingContext<TColumnMeta>) => Promise<ColumnProposal<TColumnMeta> | null> {
  return async (context) => {
    const subModel = typeof subDef.model === "function" ? await subDef.model(context) : subDef.model;

    const mappingEntries: Array<[string, Var]> = [];
    if (subDef.mapping instanceof Map) {
      for (const [k, v] of subDef.mapping.entries()) {
        const name = typeof k === "string" ? k : k.name;
        mappingEntries.push([name, v]);
      }
    } else if (Array.isArray(subDef.mapping)) {
      for (const [k, v] of subDef.mapping) {
        const name = typeof k === "string" ? k : k.name;
        mappingEntries.push([name, v]);
      }
    } else if (subDef.mapping && typeof subDef.mapping === "object") {
      for (const [k, v] of Object.entries(subDef.mapping)) {
        mappingEntries.push([k, v]);
      }
    }

    const pricingObj = new LinExpr();
    for (const [cName, subVar] of mappingEntries) {
      const dual = context.getDual(cName);
      if (Math.abs(dual) > 1e-12) {
        pricingObj.addTerm(subVar, dual);
      }
    }

    subModel.objective(isMasterMaximize ? minimize(pricingObj) : maximize(pricingObj));

    const subStatus = await subModel.solve(defaultSolver, defaultSolverOptions);
    if (subStatus !== "Optimal" && subStatus !== "Feasible") {
      return null;
    }

    const zStar = subModel.objectiveValue ?? 0;
    const colCost = subDef.cost ?? 1;

    // Reduced cost: rc = cost - sum(dual * a) = colCost - zStar
    // An improving column has rc < -tol for minimization, or rc > +tol for maximization
    const reducedCost = colCost - zStar;
    const isImproving = isMasterMaximize
      ? reducedCost > context.reducedCostTolerance
      : reducedCost < -context.reducedCostTolerance;

    if (!isImproving) {
      return null;
    }

    const coefficients: Record<string, number> = {};
    for (const [cName, subVar] of mappingEntries) {
      const val = subVar.value ?? 0;
      if (Math.abs(val) > 1e-9) {
        coefficients[cName] = subVar.type === "Continuous" ? val : Math.round(val);
      }
    }

    return {
      cost: colCost,
      type: subDef.type || "Integer",
      lb: subDef.lb,
      ub: subDef.ub,
      coefficients,
      reducedCost,
    };
  };
}

/**
 * Solve a problem using Column Generation (Dantzig-Wolfe decomposition).
 *
 * Column Generation starts with a Restricted Master Problem (RMP) containing a small set of initial columns,
 * repeatedly solves its continuous LP relaxation to obtain dual values (shadow prices), and calls a user-provided
 * `subproblem` (declarative mapping) or `pricing` subproblem callback to identify new columns with improving reduced costs.
 * Once no improving columns exist, it optionally solves the master as a Mixed-Integer Program (MIP)
 * to produce an integer solution.
 *
 * @param options Column generation options including master model and subproblem or pricing callback
 * @returns Result object containing status, objective, iterations, columns added, and final variable values
 *
 * @example
 * ```ts
 * const result = await solveColumnGeneration({
 *   master,
 *   subproblem: () => ({
 *     model: knapsackSubproblem,
 *     mapping: { demand_A: a_A, demand_B: a_B },
 *   }),
 *   cost: 1,
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
    subproblem,
    maxIterations = 100,
    reducedCostTolerance = 1e-6,
    finalizeAsMIP = true,
    solver,
    solverOptions,
    onIteration,
  } = options;

  const isMaximize = master.sense.toLowerCase() === "maximize";

  let pricingFn = pricing;
  if (!pricingFn && subproblem) {
    if (typeof subproblem === "function") {
      const subFn = subproblem;
      pricingFn = async (context: PricingContext<TColumnMeta>) => {
        const subOutput = await subFn(context);
        if (!subOutput) {
          return null;
        }
        if (isModelLike(subOutput)) {
          const colLink = subOutput.columnLink;
          if (!colLink) {
            throw new Error(
              "Subproblem Model returned from subproblem callback does not have column links. " +
                "Call sub.linkColumn({ cost, coefficients }) before returning the subproblem model."
            );
          }
          const mapping = colLink.coefficients ?? colLink.mapping;
          if (!mapping) {
            throw new Error(
              "ColumnLinkOptions must specify either 'coefficients' or 'mapping'."
            );
          }
          const declarPricing = createPricingFromDeclarativeSubproblem<TColumnMeta>(
            {
              model: subOutput,
              mapping,
              cost: colLink.cost,
              type: colLink.type,
              lb: colLink.lb,
              ub: colLink.ub,
            },
            isMaximize,
            solver,
            solverOptions
          );
          return declarPricing(context);
        }
        return subOutput;
      };
    } else {
      pricingFn = createPricingFromDeclarativeSubproblem(
        subproblem,
        isMaximize,
        solver,
        solverOptions
      );
    }
  }

  if (!pricingFn) {
    throw new Error(
      "Either 'subproblem' (declarative definition) or 'pricing' (custom callback) must be provided in ColumnGenerationOptions."
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
      const colVar = master.column({
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
