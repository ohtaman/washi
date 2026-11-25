import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P054Input {
  transitions: number[][];
}

export interface P054Output {
  setlist: number[];
  totalCost: number;
}

export async function solve(input: P054Input): Promise<P054Output> {
  const n = input.transitions.length;
  const m = new Model("DjSetlistTour");

  // x[i][j] in {0, 1}: binary indicator for transitioning from track i to track j (i != j)
  // u[i] in [1, n-1]: continuous MTZ position variable for track i > 0
  const x = input.transitions.map((row, i) =>
    row.map((_, j) => (i === j ? null : m.binary(`x_${i}_${j}`)))
  );
  const u = input.transitions.map((_, i) =>
    i === 0 ? null : m.continuous(`u_${i}`, { lb: 1, ub: n - 1 })
  );

  // Degree constraints: every track has exactly one outgoing and one incoming transition
  for (let i = 0; i < n; i++) {
    m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
    m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  }

  // Miller-Tucker-Zemlin (MTZ) subtour elimination: x[i][j] == 1 => u[j] >= u[i] + 1
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (i !== j) {
        m.constraint(expr`${u[i]!} - ${u[j]!} + ${n} * ${x[i][j]!} <= ${n - 1}`);
      }
    }
  }

  // Minimize total transition cost across the Hamiltonian tour
  m.objective(
    minimize(
      sum(
        x.flatMap((row, i) =>
          row.map((v, j) => (v ? expr`${input.transitions[i][j]} * ${v}` : 0))
        )
      )
    )
  );
  await m.solve();

  // Reconstruct tour order starting from track 0
  const setlist = [0];
  let cur = 0;
  for (let step = 1; step < n; step++) {
    const nxt = x[cur].findIndex((v) => v !== null && Math.round(v.value!) === 1);
    setlist.push(nxt);
    cur = nxt;
  }

  return {
    setlist,
    totalCost: m.objectiveValue!,
  };
}
