import { Model, Var, expr, minimize, sum } from "@ohtaman/washi";

export interface P093Input {
  distances: number[][];
}

export interface P093Output {
  tour: number[];
  totalDistance: number;
  iterations: number;
}

export async function solve(input: P093Input): Promise<P093Output> {
  const n = input.distances.length;
  const m = new Model("SymmetricTSP_DFJ");

  const edgeKey = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);
  const edges = new Map<string, Var>();
  let objExpr = expr`0`;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = m.binary(`x_${i}_${j}`);
      edges.set(edgeKey(i, j), v);
      objExpr = objExpr.add(v.mul(input.distances[i][j]));
    }
  }

  m.objective(minimize(objExpr));

  for (let i = 0; i < n; i++) {
    const incident: Var[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) incident.push(edges.get(edgeKey(i, j))!);
    }
    m.constraint(expr`sum(${incident}) == 2`, `deg_${i}`);
  }

  let iterations = 0;
  let finalTour: number[] = [];

  while (true) {
    iterations++;
    await m.solve();

    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.round(edges.get(edgeKey(i, j))!.value ?? 0) === 1) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    const visited = new Set<number>();
    const components: number[][] = [];
    for (let start = 0; start < n; start++) {
      if (visited.has(start)) continue;
      const comp: number[] = [];
      let curr = start;
      let prev = -1;
      while (!visited.has(curr)) {
        visited.add(curr);
        comp.push(curr);
        const nxt = adj[curr].find((u) => u !== prev);
        if (nxt === undefined) break;
        prev = curr;
        curr = nxt;
      }
      components.push(comp);
    }

    if (components.length === 1) {
      finalTour = components[0];
      break;
    }

    components.forEach((comp, idx) => {
      const internalEdges: Var[] = [];
      for (let a = 0; a < comp.length; a++) {
        for (let b = a + 1; b < comp.length; b++) {
          internalEdges.push(edges.get(edgeKey(comp[a], comp[b]))!);
        }
      }
      m.constraint(
        expr`sum(${internalEdges}) <= ${comp.length - 1}`,
        `dfj_${iterations}_${idx}`
      );
    });
  }

  return {
    tour: finalTour,
    totalDistance: m.objectiveValue!,
    iterations,
  };
}
