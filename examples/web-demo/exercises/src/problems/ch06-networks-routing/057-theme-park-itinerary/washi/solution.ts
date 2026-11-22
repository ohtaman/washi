import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P057Input {
  travelTimes: number[][];
  earliest: number[];
  latest: number[];
  visitDurations: number[];
  maxGroups: number;
}

export interface P057Output {
  itineraries: number[][];
  totalCost: number;
}

export async function solve(input: P057Input): Promise<P057Output> {
  const n = input.travelTimes.length;
  const { travelTimes, earliest, latest, visitDurations } = input;
  const m = new Model("ThemeParkItinerary");

  const x = travelTimes.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const t = travelTimes.map((_, i) =>
    m.continuous(`t_${i}`, { lb: earliest[i], ub: latest[i] })
  );
  const maxAttractions = Math.max(1, n - 1);
  const u = travelTimes.map((_, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: 1, ub: maxAttractions })
  );

  m.constraint(expr`${t[0]} == ${earliest[0]}`);
  for (let i = 1; i < n; i++) {
    m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
    m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  }

  const gateOut = sum(x[0].slice(1).filter((v) => v !== null));
  const gateIn = sum(x.slice(1).map((row) => row[0]).filter((v) => v !== null));
  m.constraint(expr`${gateOut} <= ${input.maxGroups}`);
  m.constraint(expr`${gateOut} == ${gateIn}`);

  for (let j = 1; j < n; j++) {
    const bigM0j = Math.max(0, earliest[0] + visitDurations[0] + travelTimes[0][j] - earliest[j]);
    m.constraint(
      expr`${t[0]} + ${visitDurations[0] + travelTimes[0][j]} - ${t[j]} <= ${bigM0j} * (1 - ${x[0][j]!})`
    );
  }

  for (let i = 1; i < n; i++) {
    const bigMi0 = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][0] - latest[0]);
    m.constraint(
      expr`${t[i]} + ${visitDurations[i] + travelTimes[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
    );
    for (let j = 1; j < n; j++) {
      if (i !== j) {
        const bigMij = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][j] - earliest[j]);
        m.constraint(
          expr`${t[i]} + ${visitDurations[i] + travelTimes[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
        );
        m.constraint(
          expr`${u[i]!} + 1 - ${u[j]!} <= ${maxAttractions} * (1 - ${x[i][j]!})`
        );
      }
    }
  }

  m.objective(
    minimize(
      sum(
        x.flatMap((row, i) =>
          row.map((v, j) => (v ? expr`${travelTimes[i][j]} * ${v}` : 0))
        )
      )
    )
  );
  await m.solve();

  const itineraries: number[][] = [];
  for (let j = 1; j < n; j++) {
    if (Math.round(x[0][j]!.value!) === 1) {
      const route = [0, j];
      let cur = j;
      while (cur !== 0) {
        const nxt = x[cur].findIndex((v) => v !== null && Math.round(v.value!) === 1);
        route.push(nxt);
        cur = nxt;
      }
      itineraries.push(route);
    }
  }

  return {
    itineraries,
    totalCost: m.objectiveValue!,
  };
}
