import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P051Edge {
  from: number;
  to: number;
  cap: number;
  cost: number;
}

export interface P051Input {
  supplies: number[];
  edges: P051Edge[];
}

export interface P051Output {
  flows: number[];
  totalCost: number;
}

export async function solve(input: P051Input): Promise<P051Output> {
  const m = new Model("MinCostFlowTU");

  // flows[i]: continuous flow along edge i in [0, cap]; TU constraint matrix yields integral optima
  const flows = input.edges.map((e, i) =>
    m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
  );

  // Flow conservation at each node: net outflow (out - in) equals node supply/demand
  m.constraint(
    input.supplies.map((supply, v) => {
      const outFlows = flows.filter((_, i) => input.edges[i].from === v);
      const inFlows = flows.filter((_, i) => input.edges[i].to === v);
      return expr`${sum(outFlows)} - ${sum(inFlows)} == ${supply}`;
    })
  );

  // Minimize total edge flow cost
  m.objective(
    minimize(sum(flows.map((f, i) => expr`${input.edges[i].cost} * ${f}`)))
  );
  await m.solve();

  // Normalize -0.0 to 0
  return {
    flows: flows.map((f) => f.value! || 0),
    totalCost: m.objectiveValue!,
  };
}
