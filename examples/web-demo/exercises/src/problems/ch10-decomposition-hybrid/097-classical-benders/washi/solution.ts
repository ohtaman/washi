import { Model, BendersCut, Constraint, expr, minimize } from "@ohtaman/washi";

export interface P097Input {
  fixedCosts: number[];
  capacities: number[];
  demands: number[];
  shippingCosts: number[][];
}

export interface P097Output {
  open: number[];
  shipments: number[][];
  totalCost: number;
}

// Build the second-stage transportation LP for fixed facility openings yBar; elastic=true adds slack for Phase-1 feasibility cuts
function buildShippingLp(input: P097Input, yBar: number[], elastic: boolean) {
  const I = input.fixedCosts.length;
  const J = input.demands.length;
  const sub = new Model(elastic ? "CflpPhase1" : "CflpShippingSub");
  // x[i][j] = shipment from facility i to customer j; s[j] = unmet demand slack (Phase-1 only)
  const x = Array.from({ length: I }, (_, i) =>
    Array.from({ length: J }, (_, j) => sub.continuous(`x_${i}_${j}`, { lb: 0 }))
  );
  const s = elastic ? sub.continuous(J, { prefix: "slack", lb: 0 }) : [];

  // Phase 1 minimizes total unmet demand slack; Phase 2 minimizes shipping cost
  let objExpr = expr`0`;
  if (elastic) {
    for (let j = 0; j < J; j++) {
      objExpr = objExpr.add(s[j]);
    }
  } else {
    for (let i = 0; i < I; i++) {
      for (let j = 0; j < J; j++) {
        objExpr = objExpr.add(x[i][j].mul(input.shippingCosts[i][j]));
      }
    }
  }
  sub.objective(minimize(objExpr));

  // Demand constraints (dual alpha_j) and facility capacity constraints (dual beta_i <= 0)
  const demCons: Constraint[] = [];
  for (let j = 0; j < J; j++) {
    let supply = expr`0`;
    for (let i = 0; i < I; i++) {
      supply = supply.add(x[i][j]);
    }
    if (elastic) supply = supply.add(s[j]);
    demCons.push(sub.constraint(expr`${supply} >= ${input.demands[j]}`, `dem_${j}`));
  }

  const capCons: Constraint[] = [];
  for (let i = 0; i < I; i++) {
    let outFlow = expr`0`;
    for (let j = 0; j < J; j++) {
      outFlow = outFlow.add(x[i][j]);
    }
    capCons.push(
      sub.constraint(expr`${outFlow} <= ${input.capacities[i] * yBar[i]}`, `cap_${i}`)
    );
  }

  return { sub, x, demCons, capCons };
}

export async function solve(input: P097Input): Promise<P097Output> {
  const I = input.fixedCosts.length;
  const J = input.demands.length;

  // Master problem: binary facility-open decisions and epigraph variable theta >= second-stage shipping cost
  const master = new Model("CflpBendersMaster");
  const open = master.binary(I, { prefix: "open" });
  const theta = master.continuous("theta", { lb: 0 });
  master.objective(minimize(expr`dot(${input.fixedCosts}, ${open}) + ${theta}`));

  let cutCount = 0;
  // Classical Benders loop: separate feasibility cuts (Phase 1) and optimality cuts (Phase 2)
  const bendersRes = await master.solveBenders({
    theta,
    maxIterations: 150,
    gapTolerance: 1e-5,
    subproblem: async ({ getMasterValue }): Promise<BendersCut | null> => {
      // Round master binary solution before passing capacities to the LP subproblem
      const yBar = open.map((v) => Math.round(getMasterValue(v)) || 0);
      const totalOpenCap = yBar.reduce((acc, y, i) => acc + input.capacities[i] * y, 0);
      const totalDemand = input.demands.reduce((acc, d) => acc + d, 0);

      // If total open capacity < total demand, generate a Benders feasibility cut from Phase-1 duals
      if (totalOpenCap < totalDemand - 1e-6) {
        const p1 = buildShippingLp(input, yBar, true);
        await p1.sub.solve();
        const alpha = p1.demCons.map((c) => c.dual ?? 0);
        const beta = p1.capCons.map((c) => c.dual ?? 0);
        const constTerm = alpha.reduce((acc, a, j) => acc + input.demands[j] * a, 0);

        // Feasibility cut: sum_i (-cap_i * beta_i) * open_i >= sum_j (demand_j * alpha_j)
        let lhs = expr`0`;
        for (let i = 0; i < I; i++) {
          lhs = lhs.add(open[i].mul(-input.capacities[i] * beta[i]));
        }
        cutCount++;
        return {
          kind: "feasibility",
          name: `fcut_${cutCount}`,
          constraint: expr`${lhs} >= ${constTerm}`,
          dualValues: Object.fromEntries(alpha.map((a, j) => [`dem_${j}`, a])),
        };
      }

      // Solve Phase-2 shipping LP; fall back to Phase-1 feasibility cut if subproblem is still infeasible
      const p2 = buildShippingLp(input, yBar, false);
      const status = await p2.sub.solve();
      if (status !== "Optimal") {
        const p1 = buildShippingLp(input, yBar, true);
        await p1.sub.solve();
        const alpha = p1.demCons.map((c) => c.dual ?? 0);
        const beta = p1.capCons.map((c) => c.dual ?? 0);
        const constTerm = alpha.reduce((acc, a, j) => acc + input.demands[j] * a, 0);
        let lhs = expr`0`;
        for (let i = 0; i < I; i++) {
          lhs = lhs.add(open[i].mul(-input.capacities[i] * beta[i]));
        }
        cutCount++;
        return {
          kind: "feasibility",
          name: `fcut_${cutCount}`,
          constraint: expr`${lhs} >= ${constTerm}`,
        };
      }

      const fixedCost = yBar.reduce((acc, y, i) => acc + input.fixedCosts[i] * y, 0);
      const shipCost = p2.sub.objectiveValue ?? 0;
      const totalCostHere = fixedCost + shipCost;

      // Optimality cut from Phase-2 duals: theta - sum_i (cap_i * beta_i) * open_i >= sum_j (demand_j * alpha_j)
      const alpha = p2.demCons.map((c) => c.dual ?? 0);
      const beta = p2.capCons.map((c) => c.dual ?? 0);
      const constTerm = alpha.reduce((acc, a, j) => acc + input.demands[j] * a, 0);

      let lhs = expr`${theta}`;
      for (let i = 0; i < I; i++) {
        lhs = lhs.sub(open[i].mul(input.capacities[i] * beta[i]));
      }
      cutCount++;
      return {
        kind: "optimality",
        name: `ocut_${cutCount}`,
        constraint: expr`${lhs} >= ${constTerm}`,
        subproblemObjective: totalCostHere,
      };
    },
  });

  // Recover optimal shipments by solving the shipping LP once more at the optimal open vector
  const optOpen = open.map((v) => Math.round(bendersRes.values[v.name] ?? 0) || 0);
  const finalShip = buildShippingLp(input, optOpen, false);
  await finalShip.sub.solve();

  const shipments = finalShip.x.map((row) => row.map((v) => Math.max(0, v.value ?? 0)));
  const fixedTotal = optOpen.reduce((acc, y, i) => acc + input.fixedCosts[i] * y, 0);
  const totalCost = fixedTotal + (finalShip.sub.objectiveValue ?? 0);

  return { open: optOpen, shipments, totalCost };
}
