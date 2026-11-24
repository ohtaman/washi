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

  // Undirected binary edge variables x[i][j] (i < j) = 1 if edge {i, j} is in the tour
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

  // Minimize total tour length
  m.objective(minimize(objExpr));

  // Degree-2 constraints: every city must have exactly 2 incident tour edges
  for (let i = 0; i < n; i++) {
    const incident: Var[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) incident.push(edges.get(edgeKey(i, j))!);
    }
    m.constraint(expr`sum(${incident}) == 2`, `deg_${i}`);
  }

  let iterations = 0;
  let finalTour: number[] = [];

  // Iterative DFJ cutting-plane loop: solve 2-factor relaxation, then cut off disconnected subtours
  while (true) {
    iterations++;
    await m.solve();

    // Reconstruct active edges using Math.round to handle solver tolerance
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.round(edges.get(edgeKey(i, j))!.value ?? 0) === 1) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    // Extract connected components (cycles) in the current 2-regular graph
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

    // A single component of size n means we have a valid Hamiltonian tour
    if (components.length === 1) {
      finalTour = components[0];
      break;
    }

    // Add Dantzig-Fulkerson-Johnson (DFJ) subtour elimination cuts: sum_{e in E(S)} x_e <= |S| - 1
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
