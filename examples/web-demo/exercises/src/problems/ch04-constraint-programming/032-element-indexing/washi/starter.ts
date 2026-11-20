import { Model, at, distinct, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P032Input {
  costs: number[][];
}

export interface P032Output {
  assignment: number[];
  totalCost: number;
}

export async function solve(input: P032Input): Promise<P032Output> {
  const n = input.costs.length;
  const numMachines = input.costs[0].length;
  const m = new Model("ElementAssignment");

  const assignment = m.integer(n, {
    lb: 0,
    ub: numMachines - 1,
    prefix: "assign",
  });

  // TODO 1: Enforce distinct(assignment) so every job runs on a separate machine
  // TODO 2: Minimize sum(input.costs.map((row, i) => at(row, assignment[i])))

  await m.solve({ solver: "pumpkin" });

  return {
    assignment: assignment.map((v) => Math.round(v.value!) || 0),
    totalCost: Math.round(m.objectiveValue!) || 0,
  };
}
