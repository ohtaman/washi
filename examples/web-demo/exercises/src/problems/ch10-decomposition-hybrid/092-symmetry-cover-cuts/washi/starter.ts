import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P092Input {
  weights: number[];
  binCapacity: number;
}

export interface P092Output {
  assignments: number[];
  binsUsed: number;
  lpBound: number;
}

export async function solve(input: P092Input): Promise<P092Output> {
  const n = input.weights.length;
  const m = new Model("BinPackingCoverCuts");

  const used = m.binary(n, { prefix: "used" });
  const assign = m.binary(n, n, { prefix: "assign" });

  // TODO:
  // 1. Assign every item i to exactly one bin: sum(assign[i]) == 1
  // 2. Enforce bin capacity: dot(input.weights, col_k(assign)) <= input.binCapacity * used[k]
  // 3. Add symmetry breaking:
  //    - used[k] >= used[k + 1]
  //    - assign[i][k] == 0 for k > i (forces item 0 into bin 0 and prefix ordering)
  // 4. Add global rounded capacity cut: sum(used) >= Math.ceil(totalWeight / input.binCapacity)
  // 5. Add extended minimal cover cuts: for each minimal cover C (sum > B and sum - minW <= B),
  //    let E(C) = C union { j : weights[j] >= max_{i in C} weights[i] } and add
  //    sum_{i in E(C)} assign[i][k] <= (|C| - 1) * used[k] for each bin k
  // 6. Minimize sum(used), solve LP via await m.relax() for lpBound, then MIP via await m.solve()
  throw new Error("Not implemented");
}
