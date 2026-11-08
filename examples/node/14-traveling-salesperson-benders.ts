/**
 * Example 14: Traveling Salesperson Problem (TSP) via Benders Decomposition
 *
 * Demonstrates:
 * - Benders Decomposition (Dantzig-Fulkerson-Johnson / DFJ Lazy Subtour Elimination)
 * - Master problem: Degree assignment relaxation (inflow = 1, outflow = 1)
 * - Subproblem: Connected component / cycle detection identifying disconnected subtours
 * - Adding Benders feasibility cuts dynamically until a single Hamiltonian cycle is formed
 *
 * Run with: npx tsx examples/node/14-traveling-salesperson-benders.ts
 */

import { Model, expr, minimize, LinExpr, type Var } from "../../src/index.js";

export async function runTSP() {
  console.log("=== Traveling Salesperson Problem (TSP) via Benders Decomposition ===");

  // 5 cities with 2D coordinates
  const cities = [
    { id: 0, name: "City 0", x: 0, y: 0 },
    { id: 1, name: "City 1", x: 1, y: 0 },
    { id: 2, name: "City 2", x: 1, y: 2 },
    { id: 3, name: "City 3", x: 0, y: 2 },
    { id: 4, name: "City 4", x: 0.5, y: 3 },
  ];
  const n = cities.length;

  const dist = (i: number, j: number) => {
    const dx = cities[i].x - cities[j].x;
    const dy = cities[i].y - cities[j].y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 1. Build Master Problem (Assignment Relaxation)
  const master = new Model("TSP_BendersMaster");
  const x: Record<string, Var> = {};
  const objExpr = new LinExpr();

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const v = master.binary(`x_${i}_${j}`);
        x[`${i}_${j}`] = v;
        objExpr.addTerm(v, dist(i, j));
      }
    }
  }
  master.objective(minimize(objExpr));

  // Degree constraints: Exactly 1 outgoing and 1 incoming edge per city
  for (let i = 0; i < n; i++) {
    const outExpr = new LinExpr();
    const inExpr = new LinExpr();
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        outExpr.addTerm(x[`${i}_${j}`], 1);
        inExpr.addTerm(x[`${j}_${i}`], 1);
      }
    }
    master.constraint(expr`${outExpr} == 1`, `out_${i}`);
    master.constraint(expr`${inExpr} == 1`, `in_${i}`);
  }

  console.log(`Initialized TSP master problem with ${n} cities and assignment constraints.`);
  console.log("Solving iteratively with Benders Decomposition (Lazy Subtour Elimination)...");

  // 2. Solve via Benders Decomposition
  const result = await master.solveBenders({
    maxIterations: 20,
    subproblem: ({ iteration }) => {
      // Reconstruct tour from candidate master binary values
      const nextCity: number[] = new Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            if ((x[`${i}_${j}`].value ?? 0) > 0.5) {
              nextCity[i] = j;
            }
          }
        }
      }

      // Detect disconnected subtours (cycles)
      const visited = new Array(n).fill(false);
      const cycles: number[][] = [];
      for (let start = 0; start < n; start++) {
        if (!visited[start]) {
          const cycle: number[] = [];
          let curr = start;
          while (!visited[curr] && curr !== -1) {
            visited[curr] = true;
            cycle.push(curr);
            curr = nextCity[curr];
          }
          if (cycle.length > 0) {
            cycles.push(cycle);
          }
        }
      }

      // If a single cycle covers all n cities, the tour is complete
      if (cycles.length === 1 && cycles[0].length === n) {
        return null; // Optimal tour found; no further cuts needed
      }

      // Subtour detected: Generate Subtour Elimination Constraint (Benders Feasibility Cut)
      // for the smallest disconnected component S: sum_{i in S, j in S} x_ij <= |S| - 1
      const smallest = cycles.reduce((min, c) => (c.length < min.length ? c : min), cycles[0]);
      const secExpr = new LinExpr();
      for (const i of smallest) {
        for (const j of smallest) {
          if (i !== j) {
            secExpr.addTerm(x[`${i}_${j}`], 1);
          }
        }
      }

      console.log(`  Iter ${iteration}: Subtour detected: [${smallest.join(" -> ")}]. Adding Benders feasibility cut.`);

      return {
        kind: "feasibility",
        constraint: expr`${secExpr} <= ${smallest.length - 1}`,
        name: `sec_${smallest.join("_")}`,
      };
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Optimal Tour Distance: ${result.objectiveValue?.toFixed(3)}`);
  console.log(`Total Benders Cuts Added: ${result.cutsAdded}`);
  console.log(`Iterations: ${result.iterations}`);

  console.log("\nOptimal tour edges:");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (result.values[`x_${i}_${j}`] ?? 0) > 0.5) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (distance: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
  return result;
}

if (process.argv[1]?.includes("14-traveling-salesperson-benders")) {
  runTSP().catch(console.error);
}
