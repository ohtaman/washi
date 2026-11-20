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

  // Solve as a pure continuous LP: Total Unimodularity guarantees integral vertex solutions.
  const flows = input.edges.map((e, i) =>
    m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
  );

  // TODO:
  // 1. Add flow conservation for each node v: outflow(v) - inflow(v) == input.supplies[v]
  // 2. Minimize total flow cost sum(e.cost * flows[i]), call `await m.solve()`,
  //    and return { flows: flows.map((v) => v.value! || 0), totalCost: m.objectiveValue! }
  throw new Error("Not implemented");
}
