import { Model, at, distinct, minimize, sum } from "@ohtaman/washi";

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

  // assignment[i]: 0-based machine index assigned to task i
  const assignment = m.integer(n, {
    lb: 0,
    ub: numMachines - 1,
    prefix: "assign",
  });

  // Each task must be assigned to a distinct machine
  m.constraint(distinct(assignment), "distinct_machines");
  // Minimize total assignment cost via element constraint (at) on each task's cost row
  m.objective(minimize(sum(input.costs.map((row, i) => at(row, assignment[i])))));
  await m.solve({ solver: "pumpkin" });

  // Round solver output to clean integers and normalize -0 to 0
  return {
    assignment: assignment.map((v) => Math.round(v.value!) || 0),
    totalCost: Math.round(m.objectiveValue!) || 0,
  };
}
