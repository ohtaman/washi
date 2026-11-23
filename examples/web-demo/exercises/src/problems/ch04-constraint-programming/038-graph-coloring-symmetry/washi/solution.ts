import { Model, expr, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P038Input {
  numNodes: number;
  maxColors: number;
  edges: number[][];
}

export interface P038Output {
  colors: number[];
  usedColors: number;
}

export async function solve(input: P038Input): Promise<P038Output> {
  const n = input.numNodes;
  const m = new Model("GraphColoringSymmetry");

  const colors = m.integer(n, {
    lb: 0,
    ub: input.maxColors - 1,
    prefix: "c",
  });
  const maxColor = m.integer({
    lb: 0,
    ub: input.maxColors - 1,
    name: "maxColor",
  });

  m.constraint(
    input.edges.map(([u, v]) => expr`${colors[u]} != ${colors[v]}`),
    "edge_diff"
  );

  // Value symmetry breaking: canonical first-appearance numbering
  m.constraint(expr`${colors[0]} == 0`, "sym_first");
  m.constraint(
    colors.slice(1).map((c, idx) => expr`${c} <= 1 + max(${colors.slice(0, idx + 1)})`),
    "sym_prefix"
  );

  m.constraint(
    colors.map((c) => expr`${c} <= ${maxColor}`),
    "max_color"
  );

  m.objective(minimize(expr`${maxColor} + 1`));
  await m.solve({ solver: "pumpkin" });

  return {
    colors: colors.map((v) => Math.round(v.value!) || 0),
    usedColors: Math.round(m.objectiveValue!) || 0,
  };
}
