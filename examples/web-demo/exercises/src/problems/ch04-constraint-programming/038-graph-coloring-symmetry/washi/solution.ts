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

  // colors[v]: 0-based color index assigned to node v
  // maxColor: highest color index used across all nodes
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

  // Adjacent nodes must receive distinct colors
  m.constraint(
    input.edges.map(([u, v]) => expr`${colors[u]} != ${colors[v]}`),
    "edge_diff"
  );

  // Value symmetry breaking: canonical first-appearance numbering (node 0 gets color 0,
  // and each subsequent node uses at most 1 + max color seen so far)
  m.constraint(expr`${colors[0]} == 0`, "sym_first");
  m.constraint(
    colors.slice(1).map((c, idx) => expr`${c} <= 1 + max(${colors.slice(0, idx + 1)})`),
    "sym_prefix"
  );

  // Link maxColor to the largest assigned color index
  m.constraint(
    colors.map((c) => expr`${c} <= ${maxColor}`),
    "max_color"
  );

  // Minimize number of distinct colors used (maxColor + 1 since colors are 0-indexed)
  m.objective(minimize(expr`${maxColor} + 1`));
  await m.solve({ solver: "pumpkin" });

  // Round solver output to clean integers and normalize -0 to 0
  return {
    colors: colors.map((v) => Math.round(v.value!) || 0),
    usedColors: Math.round(m.objectiveValue!) || 0,
  };
}
