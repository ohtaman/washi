import { Model, BendersCut, Var, disjoint, expr, minimize, sum } from "@ohtaman/washi";

export interface P098Input {
  costs: number[][];
  durations: number[];
  releaseTimes: number[];
  deadlines: number[];
  horizon: number;
}

export interface P098Output {
  assignments: number[];
  starts: number[];
  totalCost: number;
}

export async function solve(input: P098Input): Promise<P098Output> {
  const N = input.costs.length;
  const M = input.costs[0].length;

  const master = new Model("LBBDMaster");
  const x = Array.from({ length: N }, (_, j) =>
    Array.from({ length: M }, (_, m) => master.binary(`x_${j}_${m}`))
  );

  let costObj = expr`0`;
  for (let j = 0; j < N; j++) {
    master.constraint(expr`sum(${x[j]}) == 1`, `assign_${j}`);
    for (let m = 0; m < M; m++) {
      costObj = costObj.add(x[j][m].mul(input.costs[j][m]));
    }
  }
  master.objective(minimize(costObj));

  // TODO:
  // 1. Run await master.solveBenders({ subproblem: async ({ getMasterValue }) => ... })
  // 2. For each machine m:
  //    - Collect jobs S_m assigned to m (getMasterValue(x[j][m]) > 0.5).
  //    - Build a Pumpkin CP scheduling subproblem with integer start[j] in
  //      [releaseTimes[j], min(deadlines[j], horizon) - durations[j]] and constraint disjoint([...]).
  //    - Call await sub.check({ solver: "pumpkin" }).
  //    - If Unsat, emit a no-good cut (optionally tightened to a minimal infeasible subset via greedy deletion):
  //      sum_{j in K} x[j][m] <= K.length - 1
  // 3. Once every machine subproblem is Sat, return { assignments, starts, totalCost }.
  throw new Error("Not implemented");
}
