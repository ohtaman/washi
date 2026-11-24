import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P083Input {
  profits: number[];
  budgets: number[];
  emissions: number[];
  budgetCap: number;
  epsilons: number[];
}

export interface P083Output {
  selections: number[][];
  frontierProfits: number[];
  frontierSum: number;
}

export async function solve(input: P083Input): Promise<P083Output> {
  const n = input.profits.length;
  const selections: number[][] = [];
  const frontierProfits: number[] = [];

  // Sweep each epsilon cap on emissions to trace the Pareto frontier
  for (let k = 0; k < input.epsilons.length; k++) {
    const eps = input.epsilons[k];
    const m = new Model(`EpsilonPareto_${k}`);
    // x[j] = 1 if project j is selected
    const x = m.binary(n, { prefix: "x" });

    // Budget limit and epsilon-constraint on total emissions
    m.constraint(expr`dot(${input.budgets}, ${x}) <= ${input.budgetCap}`, "budget_cap");
    m.constraint(expr`dot(${input.emissions}, ${x}) <= ${eps}`, "epsilon_cap");
    // Maximize profit for the given emission cap
    m.objective(maximize(expr`dot(${input.profits}, ${x})`));
    await m.solve();

    // Round binary solver values to clean 0/1 integers
    selections.push(x.map((v) => Math.round(v.value!) || 0));
    frontierProfits.push(m.objectiveValue!);
  }

  return {
    selections,
    frontierProfits,
    frontierSum: frontierProfits.reduce((a, b) => a + b, 0),
  };
}
