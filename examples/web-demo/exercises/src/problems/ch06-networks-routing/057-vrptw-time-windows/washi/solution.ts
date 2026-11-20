import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P057Input {
  dist: number[][];
  earliest: number[];
  latest: number[];
  service: number[];
  maxVehicles: number;
}

export interface P057Output {
  routes: number[][];
  totalCost: number;
}

export async function solve(input: P057Input): Promise<P057Output> {
  const n = input.dist.length;
  const { dist, earliest, latest, service } = input;
  const m = new Model("VRPTW");

  const x = dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const t = dist.map((_, i) =>
    m.continuous(`t_${i}`, { lb: earliest[i], ub: latest[i] })
  );
  const maxCust = Math.max(1, n - 1);
  const u = dist.map((_, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: 1, ub: maxCust })
  );

  m.constraint(expr`${t[0]} == ${earliest[0]}`);
  for (let i = 1; i < n; i++) {
    m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
    m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  }

  const depotOut = sum(x[0].slice(1).filter((v) => v !== null));
  const depotIn = sum(x.slice(1).map((row) => row[0]).filter((v) => v !== null));
  m.constraint(expr`${depotOut} <= ${input.maxVehicles}`);
  m.constraint(expr`${depotOut} == ${depotIn}`);

  for (let j = 1; j < n; j++) {
    const bigM0j = Math.max(0, earliest[0] + service[0] + dist[0][j] - earliest[j]);
    m.constraint(
      expr`${t[0]} + ${service[0] + dist[0][j]} - ${t[j]} <= ${bigM0j} * (1 - ${x[0][j]!})`
    );
  }

  for (let i = 1; i < n; i++) {
    const bigMi0 = Math.max(0, latest[i] + service[i] + dist[i][0] - latest[0]);
    m.constraint(
      expr`${t[i]} + ${service[i] + dist[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
    );
    for (let j = 1; j < n; j++) {
      if (i !== j) {
        const bigMij = Math.max(0, latest[i] + service[i] + dist[i][j] - earliest[j]);
        m.constraint(
          expr`${t[i]} + ${service[i] + dist[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
        );
        m.constraint(
          expr`${u[i]!} + 1 - ${u[j]!} <= ${maxCust} * (1 - ${x[i][j]!})`
        );
      }
    }
  }

  m.objective(
    minimize(
      sum(
        x.flatMap((row, i) =>
          row.map((v, j) => (v ? expr`${dist[i][j]} * ${v}` : 0))
        )
      )
    )
  );
  await m.solve();

  const routes: number[][] = [];
  for (let j = 1; j < n; j++) {
    if (Math.round(x[0][j]!.value!) === 1) {
      const route = [0, j];
      let cur = j;
      while (cur !== 0) {
        const nxt = x[cur].findIndex((v) => v !== null && Math.round(v.value!) === 1);
        route.push(nxt);
        cur = nxt;
      }
      routes.push(route);
    }
  }

  return {
    routes,
    totalCost: m.objectiveValue!,
  };
}
