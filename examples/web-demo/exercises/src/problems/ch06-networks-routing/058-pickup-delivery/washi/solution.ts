import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P058Request {
  pickup: number;
  delivery: number;
  demand: number;
}

export interface P058Input {
  dist: number[][];
  requests: P058Request[];
  capacity: number;
  maxVehicles: number;
  maxStopsPerVehicle: number;
}

export interface P058Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P058Input): Promise<P058Output> {
  const n = input.dist.length;
  const K = input.maxVehicles;
  const Q = input.capacity;
  const m = new Model("PickupDelivery");

  const x = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? null : m.binary(K, { prefix: `x_${i}_${j}` })
    )
  );
  const t = Array.from({ length: n }, (_, i) =>
    m.continuous(`t_${i}`, { lb: i === 0 ? 0 : 1, ub: i === 0 ? 0 : n - 1 })
  );

  const delta = new Array(n).fill(0);
  for (const r of input.requests) {
    delta[r.pickup] = r.demand;
    delta[r.delivery] = -r.demand;
  }

  const load = Array.from({ length: n }, (_, i) =>
    m.continuous(`L_${i}`, {
      lb: i === 0 ? 0 : Math.max(0, delta[i]),
      ub: i === 0 ? 0 : Math.min(Q, Q + delta[i]),
    })
  );

  // Each non-depot stop is visited once overall
  for (let i = 1; i < n; i++) {
    const outAll = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) outAll.push(...x[i][j]!);
    }
    m.constraint(expr`${sum(outAll)} == 1`);
  }

  // Per-vehicle flow conservation and stop limits
  for (let k = 0; k < K; k++) {
    const depOut = [];
    const depIn = [];
    const custVisits = [];
    for (let j = 1; j < n; j++) {
      depOut.push(x[0][j]![k]);
      depIn.push(x[j][0]![k]);
      for (let i = 0; i < n; i++) {
        if (i !== j) custVisits.push(x[j][i]![k]);
      }
    }
    m.constraint(expr`${sum(depOut)} <= 1`);
    m.constraint(expr`${sum(depOut)} == ${sum(depIn)}`);
    m.constraint(expr`${sum(custVisits)} <= ${input.maxStopsPerVehicle}`);

    for (let i = 1; i < n; i++) {
      const inK = [];
      const outK = [];
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          inK.push(x[j][i]![k]);
          outK.push(x[i][j]![k]);
        }
      }
      m.constraint(expr`${sum(inK)} == ${sum(outK)}`);
    }
  }

  // Same-route pairing and pickup-before-delivery precedence
  for (const r of input.requests) {
    for (let k = 0; k < K; k++) {
      const pOut = [];
      const dOut = [];
      for (let j = 0; j < n; j++) {
        if (j !== r.pickup) pOut.push(x[r.pickup][j]![k]);
        if (j !== r.delivery) dOut.push(x[r.delivery][j]![k]);
      }
      m.constraint(expr`${sum(pOut)} == ${sum(dOut)}`);
    }
    m.constraint(expr`${t[r.pickup]} + 1 <= ${t[r.delivery]}`);
  }

  // Visit-order and vehicle-load propagation
  for (let i = 0; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (i === j) continue;
      const yij = sum(x[i][j]!);
      if (i > 0) {
        m.constraint(expr`${t[i]} + 1 - ${t[j]} <= ${n} * (1 - ${yij})`);
      }
      const bigMLoad = Q + Math.max(0, delta[j]);
      m.constraint(expr`${load[i]} + ${delta[j]} - ${load[j]} <= ${bigMLoad} * (1 - ${yij})`);
    }
  }

  const costTerms = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        for (let k = 0; k < K; k++) {
          costTerms.push(expr`${input.dist[i][j]} * ${x[i][j]![k]}`);
        }
      }
    }
  }
  m.objective(minimize(sum(costTerms)));
  await m.solve();

  const routes: number[][] = [];
  for (let k = 0; k < K; k++) {
    let start = -1;
    for (let j = 1; j < n; j++) {
      if (Math.round(x[0][j]![k].value!) === 1) {
        start = j;
        break;
      }
    }
    if (start === -1) continue;
    const route = [0, start];
    let cur = start;
    while (cur !== 0) {
      let nxt = 0;
      for (let j = 0; j < n; j++) {
        if (j !== cur && Math.round(x[cur][j]![k].value!) === 1) {
          nxt = j;
          break;
        }
      }
      route.push(nxt);
      cur = nxt;
    }
    routes.push(route);
  }

  return {
    routes,
    totalDistance: m.objectiveValue!,
  };
}
