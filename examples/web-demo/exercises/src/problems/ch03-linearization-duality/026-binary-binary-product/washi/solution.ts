import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P026Input {
  values: number[];
  costs: number[];
  budget: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export async function solve(input: P026Input): Promise<P026Output> {
  const n = input.values.length;
  const P = input.pairs.length;
  const m = new Model("BinaryBinaryProduct");

  const selected = m.binary(n, { prefix: "x" });
  const pairProducts = m.continuous(P, { lb: 0, ub: 1, prefix: "w" });

  m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
  m.constraint(
    input.pairs.flatMap(([i, j], k) => [
      expr`${pairProducts[k]} <= ${selected[i]}`,
      expr`${pairProducts[k]} <= ${selected[j]}`,
      expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
    ])
  );

  const synergies = input.pairs.map(([, , s]) => s);
  m.objective(
    maximize(
      expr`dot(${input.values}, ${selected}) + dot(${synergies}, ${pairProducts})`
    )
  );
  await m.solve();

  return {
    selected: selected.map((v) => Math.round(v.value!) || 0),
    pairProducts: pairProducts.map((v) => Math.round(v.value!) || 0),
    totalValue: m.objectiveValue!,
  };
}
