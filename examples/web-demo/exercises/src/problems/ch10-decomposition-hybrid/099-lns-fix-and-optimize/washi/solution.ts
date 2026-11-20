import { Model, Var, expr, minimize } from "@ohtaman/washi";

export interface P099Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCost: number;
  capacities: number[];
  initialPlan: number[];
  windowSize: number;
}

export interface P099Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

async function solveWindow(
  input: P099Input,
  fixedSetups: number[],
  winStart: number,
  winEnd: number
): Promise<P099Output | null> {
  const T = input.demands.length;
  const m = new Model("LotSizingWindow");

  const y: Var[] = [];
  for (let t = 0; t < T; t++) {
    if (t >= winStart && t < winEnd) {
      y.push(m.binary(`y_${t}`));
    } else {
      y.push(m.integer(`y_${t}`, { lb: fixedSetups[t], ub: fixedSetups[t] }));
    }
  }
  const p = input.capacities.map((cap, t) =>
    m.continuous(`p_${t}`, { lb: 0, ub: cap })
  );
  const inv = m.continuous(T, { prefix: "inv", lb: 0 });

  let obj = expr`0`;
  for (let t = 0; t < T; t++) {
    obj = obj
      .add(y[t].mul(input.setupCosts[t]))
      .add(p[t].mul(input.prodCosts[t]))
      .add(inv[t].mul(input.holdCost));

    m.constraint(expr`${p[t]} <= ${input.capacities[t]} * ${y[t]}`, `cap_${t}`);
    if (t === 0) {
      m.constraint(expr`${p[0]} - ${inv[0]} == ${input.demands[0]}`, "bal_0");
    } else {
      m.constraint(
        expr`${inv[t - 1]} + ${p[t]} - ${inv[t]} == ${input.demands[t]}`,
        `bal_${t}`
      );
    }
  }
  m.objective(minimize(obj));

  const status = await m.solve();
  if (status !== "Optimal" || m.objectiveValue === null) {
    return null;
  }

  return {
    setups: y.map((v) => Math.round(v.value ?? 0) || 0),
    production: p.map((v) => Math.max(0, v.value ?? 0)),
    inventory: inv.map((v) => Math.max(0, v.value ?? 0)),
    totalCost: m.objectiveValue,
  };
}

export async function solve(input: P099Input): Promise<P099Output> {
  const T = input.demands.length;
  const win = Math.max(1, Math.min(T, input.windowSize));
  let best = await solveWindow(input, input.initialPlan, 0, 0);
  if (!best) {
    throw new Error("Initial plan is infeasible");
  }

  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let start = 0; start <= T - win; start++) {
      const candidate = await solveWindow(input, best.setups, start, start + win);
      if (candidate && candidate.totalCost < best.totalCost - 1e-6) {
        best = candidate;
        improved = true;
      }
    }
    if (!improved) break;
  }

  const verified = await solveWindow(input, best.setups, 0, 0);
  return verified ?? best;
}
