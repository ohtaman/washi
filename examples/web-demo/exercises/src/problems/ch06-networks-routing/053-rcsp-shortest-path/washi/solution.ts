import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P053Edge {
  from: number;
  to: number;
  cost: number;
  resource: number;
}

export interface P053Input {
  nodeCount: number;
  source: number;
  sink: number;
  maxResource: number;
  edges: P053Edge[];
}

export interface P053Output {
  selected: number[];
  totalCost: number;
}

export async function solve(input: P053Input): Promise<P053Output> {
  const m = new Model("RCSP");
  // x[i] in {0, 1}: binary indicator for including edge i in the s-t path
  const x = m.binary(input.edges.length, { prefix: "x" });

  // Unit s-t flow conservation: +1 net outflow at source, -1 at sink, 0 elsewhere
  for (let v = 0; v < input.nodeCount; v++) {
    const rhs = v === input.source ? 1 : v === input.sink ? -1 : 0;
    const outVars = x.filter((_, i) => input.edges[i].from === v);
    const inVars = x.filter((_, i) => input.edges[i].to === v);
    m.constraint(expr`${sum(outVars)} - ${sum(inVars)} == ${rhs}`);
  }

  // Side constraint: total resource consumption along the path cannot exceed maxResource
  m.constraint(
    expr`${sum(x.map((v, i) => expr`${input.edges[i].resource} * ${v}`))} <= ${input.maxResource}`,
    "resource_limit"
  );

  // Minimize total path cost
  m.objective(
    minimize(sum(x.map((v, i) => expr`${input.edges[i].cost} * ${v}`)))
  );
  await m.solve();

  // Round binary indicators to clean integers and normalize -0 to 0
  return {
    selected: x.map((v) => Math.round(v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
