import { Model, allowed, at, minimize, not, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface TableRule {
  vars: number[];
  tuples: number[][];
}

export interface P033Input {
  componentCosts: number[][];
  allowedRules: TableRule[];
  forbiddenRules: TableRule[];
}

export interface P033Output {
  choices: number[];
  totalCost: number;
}

export async function solve(input: P033Input): Promise<P033Output> {
  const m = new Model("TableConfig");

  const choices = input.componentCosts.map((costs, c) =>
    m.integer(`comp_${c}`, { lb: 0, ub: costs.length - 1 })
  );

  // TODO 1: Enforce each positive compatibility table in input.allowedRules via allowed(vars, tuples)
  // TODO 2: Enforce each forbidden tuple table in input.forbiddenRules via not(allowed(vars, tuples))

  m.objective(
    minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c]))))
  );
  await m.solve({ solver: "pumpkin" });

  return {
    choices: choices.map((v) => Math.round(v.value!) || 0),
    totalCost: Math.round(m.objectiveValue!) || 0,
  };
}
