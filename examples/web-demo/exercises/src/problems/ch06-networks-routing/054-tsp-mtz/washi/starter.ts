import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P054Input {
  dist: number[][];
}

export interface P054Output {
  tour: number[];
  totalCost: number;
}

export async function solve(input: P054Input): Promise<P054Output> {
  const n = input.dist.length;
  const m = new Model("TspMtz");

  const x = input.dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const u = input.dist.map((_, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: 1, ub: n - 1 })
  );

  // TODO:
  // 1. Add degree constraints: every city has out-degree 1 and in-degree 1
  // 2. Add MTZ subtour-elimination constraints for all i != j in 1..n-1:
  //    u[i] - u[j] + n * x[i][j] <= n - 1
  // 3. Minimize total tour cost, call `await m.solve()`, and reconstruct
  //    `tour` starting at 0 by following x[cur][j] == 1.
  throw new Error("Not implemented");
}
