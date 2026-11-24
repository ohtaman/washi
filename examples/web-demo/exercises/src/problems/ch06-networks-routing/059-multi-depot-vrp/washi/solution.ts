import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P059Input {
  dist: number[][];
  demands: number[];
  vehicleCapacity: number;
  depotMaxVehicles: number[];
  depotCapacities: number[];
}

export interface P059Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P059Input): Promise<P059Output> {
  const n = input.dist.length;
  const D = input.depotMaxVehicles.length;
  const Q = input.vehicleCapacity;
  const customers = Array.from({ length: n - D }, (_, k) => D + k);
  const m = new Model("MultiDepotVRP");

  // x[d].get(`${i}_${j}`) in {0, 1}: binary indicator that a vehicle from depot d traverses i -> j
  const x = Array.from({ length: D }, (_, d) => {
    const vd = [d, ...customers];
    const map = new Map<string, ReturnType<Model["binary"]>>();
    for (const i of vd) {
      for (const j of vd) {
        if (i !== j) map.set(`${i}_${j}`, m.binary(`x_${d}_${i}_${j}`));
      }
    }
    return map;
  });

  // u[c] in [demands[c], Q]: continuous cumulative vehicle load after serving customer c
  const u = customers.map((c) =>
    m.continuous(`u_${c}`, { lb: input.demands[c], ub: Q })
  );

  // Visit every customer once across all depots
  for (const i of customers) {
    const outVars = [];
    for (let d = 0; d < D; d++) {
      const vd = [d, ...customers];
      for (const j of vd) {
        if (i !== j) outVars.push(x[d].get(`${i}_${j}`)!);
      }
    }
    m.constraint(expr`${sum(outVars)} == 1`);
  }

  // Per-depot conservation, fleet caps, and depot supply caps
  for (let d = 0; d < D; d++) {
    const vd = [d, ...customers];
    for (const i of customers) {
      const inVars = vd.filter((j) => j !== i).map((j) => x[d].get(`${j}_${i}`)!);
      const outVars = vd.filter((j) => j !== i).map((j) => x[d].get(`${i}_${j}`)!);
      m.constraint(expr`${sum(inVars)} == ${sum(outVars)}`);
    }

    const depOut = customers.map((j) => x[d].get(`${d}_${j}`)!);
    const depIn = customers.map((i) => x[d].get(`${i}_${d}`)!);
    m.constraint(expr`${sum(depOut)} <= ${input.depotMaxVehicles[d]}`);
    m.constraint(expr`${sum(depOut)} == ${sum(depIn)}`);

    const depotDemandTerms = customers.map((i) => {
      const outVars = vd.filter((j) => j !== i).map((j) => x[d].get(`${i}_${j}`)!);
      return expr`${input.demands[i]} * ${sum(outVars)}`;
    });
    m.constraint(expr`${sum(depotDemandTerms)} <= ${input.depotCapacities[d]}`);
  }

  // Vehicle load-tracking MTZ across all customer pairs
  for (let idxI = 0; idxI < customers.length; idxI++) {
    for (let idxJ = 0; idxJ < customers.length; idxJ++) {
      if (idxI === idxJ) continue;
      const ci = customers[idxI];
      const cj = customers[idxJ];
      const yij = sum(x.map((xd) => xd.get(`${ci}_${cj}`)!));
      m.constraint(
        expr`${u[idxI]} - ${u[idxJ]} + ${Q} * ${yij} <= ${Q - input.demands[cj]}`
      );
    }
  }

  // Minimize total travel distance across all depots and routes
  const costTerms = [];
  for (let d = 0; d < D; d++) {
    const vd = [d, ...customers];
    for (const i of vd) {
      for (const j of vd) {
        if (i !== j) {
          costTerms.push(expr`${input.dist[i][j]} * ${x[d].get(`${i}_${j}`)!}`);
        }
      }
    }
  }
  m.objective(minimize(sum(costTerms)));
  await m.solve();

  // Reconstruct each vehicle route starting and ending at its assigned depot d
  const routes: number[][] = [];
  for (let d = 0; d < D; d++) {
    const vd = [d, ...customers];
    for (const j of customers) {
      if (Math.round(x[d].get(`${d}_${j}`)!.value!) === 1) {
        const route = [d, j];
        let cur = j;
        while (cur !== d) {
          const nxt = vd.find(
            (k) => k !== cur && Math.round(x[d].get(`${cur}_${k}`)!.value!) === 1
          )!;
          route.push(nxt);
          cur = nxt;
        }
        routes.push(route);
      }
    }
  }

  return {
    routes,
    totalDistance: m.objectiveValue!,
  };
}
