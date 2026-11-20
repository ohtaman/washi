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

function buildShippingLp(input: P097Input, yBar: number[], elastic: boolean) {
  const I = input.fixedCosts.length;
  const J = input.demands.length;
  const sub = new Model(elastic ? "CflpPhase1" : "CflpShippingSub");
  const x = Array.from({ length: I }, (_, i) =>
    Array.from({ length: J }, (_, j) => sub.continuous(`x_${i}_${j}`, { lb: 0 }))
  );
  const s = elastic ? sub.continuous(J, { prefix: "slack", lb: 0 }) : [];

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

  const master = new Model("CflpBendersMaster");
  const open = master.binary(I, { prefix: "open" });
  const theta = master.continuous("theta", { lb: 0 });
  master.objective(minimize(expr`dot(${input.fixedCosts}, ${open}) + ${theta}`));

  let cutCount = 0;
  const bendersRes = await master.solveBenders({
    theta,
    maxIterations: 150,
    gapTolerance: 1e-5,
    subproblem: async ({ getMasterValue }): Promise<BendersCut | null> => {
      const yBar = open.map((v) => Math.round(getMasterValue(v)) || 0);
      const totalOpenCap = yBar.reduce((acc, y, i) => acc + input.capacities[i] * y, 0);
      const totalDemand = input.demands.reduce((acc, d) => acc + d, 0);

      if (totalOpenCap < totalDemand - 1e-6) {
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
          dualValues: Object.fromEntries(alpha.map((a, j) => [`dem_${j}`, a])),
        };
      }

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

  const optOpen = open.map((v) => Math.round(bendersRes.values[v.name] ?? 0) || 0);
  const finalShip = buildShippingLp(input, optOpen, false);
  await finalShip.sub.solve();

  const shipments = finalShip.x.map((row) => row.map((v) => Math.max(0, v.value ?? 0)));
  const fixedTotal = optOpen.reduce((acc, y, i) => acc + input.fixedCosts[i] * y, 0);
  const totalCost = fixedTotal + (finalShip.sub.objectiveValue ?? 0);

  return { open: optOpen, shipments, totalCost };
}
