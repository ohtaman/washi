import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P052Edge {
  from: number;
  to: number;
  cap: number;
}

export interface P052Input {
  nodeCount: number;
  source: number;
  sink: number;
  edges: P052Edge[];
}

export interface P052Output {
  flows: number[];
  cutEdges: number[];
  maxFlow: number;
}

export async function solve(input: P052Input): Promise<P052Output> {
  const n = input.nodeCount;
  const m = new Model("MaxFlowMinCut");

  const flows = input.edges.map((e, i) =>
    m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
  );

  for (let v = 0; v < n; v++) {
    if (v === input.source || v === input.sink) continue;
    const outFlows = flows.filter((_, i) => input.edges[i].from === v);
    const inFlows = flows.filter((_, i) => input.edges[i].to === v);
    m.constraint(expr`${sum(outFlows)} - ${sum(inFlows)} == 0`);
  }

  const sOut = flows.filter((_, i) => input.edges[i].from === input.source);
  const sIn = flows.filter((_, i) => input.edges[i].to === input.source);
  m.objective(maximize(expr`${sum(sOut)} - ${sum(sIn)}`));
  await m.solve();

  const flowVals = flows.map((f) => f.value! || 0);

  // Extract canonical minimum s-t cut via residual reachability from source
  const visited = new Array(n).fill(false);
  visited[input.source] = true;
  const queue = [input.source];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (let i = 0; i < input.edges.length; i++) {
      const e = input.edges[i];
      if (e.from === u && !visited[e.to] && flowVals[i] < e.cap - 1e-6) {
        visited[e.to] = true;
        queue.push(e.to);
      }
      if (e.to === u && !visited[e.from] && flowVals[i] > 1e-6) {
        visited[e.from] = true;
        queue.push(e.from);
      }
    }
  }

  const cutEdges = input.edges
    .map((_, i) => i)
    .filter((i) => visited[input.edges[i].from] && !visited[input.edges[i].to]);

  return {
    flows: flowVals,
    cutEdges,
    maxFlow: m.objectiveValue!,
  };
}
