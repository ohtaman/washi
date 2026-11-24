import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P056Input {
  dist: number[][];
  demands: number[];
  capacity: number;
  maxVehicles: number;
}

export interface P056Output {
  routes: number[][];
  totalDistance: number;
}

export async function solve(input: P056Input): Promise<P056Output> {
  const n = input.dist.length;
  const Q = input.capacity;
  const m = new Model("CVRP");

  // x[i][j] in {0, 1}: binary indicator for traversing arc i -> j (i != j; node 0 is depot)
  // u[i] in [demands[i], Q]: cumulative vehicle load after serving customer i > 0
  const x = input.dist.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const u = input.demands.map((d, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: d, ub: Q })
  );

  // Every customer i > 0 is visited exactly once (one incoming and one outgoing arc)
  for (let i = 1; i < n; i++) {
    m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
    m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  }

  // Depot flow balance and fleet size cap (<= maxVehicles routes)
  const depotOut = sum(x[0].slice(1).filter((v) => v !== null));
  const depotIn = sum(x.slice(1).map((row) => row[0]).filter((v) => v !== null));
  m.constraint(expr`${depotOut} <= ${input.maxVehicles}`);
  m.constraint(expr`${depotOut} == ${depotIn}`);

  // MTZ capacity & subtour elimination: x[i][j] == 1 => u[j] >= u[i] + demands[j]
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (i !== j) {
        m.constraint(
          expr`${u[i]!} - ${u[j]!} + ${Q} * ${x[i][j]!} <= ${Q - input.demands[j]}`
        );
      }
    }
  }

  // Minimize total travel distance across all vehicle routes
  m.objective(
    minimize(
      sum(
        x.flatMap((row, i) =>
          row.map((v, j) => (v ? expr`${input.dist[i][j]} * ${v}` : 0))
        )
      )
    )
  );
  await m.solve();

  // Reconstruct each vehicle route starting and ending at depot 0
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
    totalDistance: m.objectiveValue!,
  };
}
