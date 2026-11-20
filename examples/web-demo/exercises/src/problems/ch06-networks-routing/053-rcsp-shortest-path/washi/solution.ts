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
  const x = m.binary(input.edges.length, { prefix: "x" });

  for (let v = 0; v < input.nodeCount; v++) {
    const rhs = v === input.source ? 1 : v === input.sink ? -1 : 0;
    const outVars = x.filter((_, i) => input.edges[i].from === v);
    const inVars = x.filter((_, i) => input.edges[i].to === v);
    m.constraint(expr`${sum(outVars)} - ${sum(inVars)} == ${rhs}`);
  }

  m.constraint(
    expr`${sum(x.map((v, i) => expr`${input.edges[i].resource} * ${v}`))} <= ${input.maxResource}`,
    "resource_limit"
  );

  m.objective(
    minimize(sum(x.map((v, i) => expr`${input.edges[i].cost} * ${v}`)))
  );
  await m.solve();

  return {
    selected: x.map((v) => Math.round(v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
