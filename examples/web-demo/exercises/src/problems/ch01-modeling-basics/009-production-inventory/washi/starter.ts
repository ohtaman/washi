import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P009Input {
  demands: number[];
  regCap: number[];
  otCap: number[];
  invCap: number;
  initialInventory: number;
  minFinalInventory: number;
  regCost: number;
  otCost: number;
  holdCost: number;
}

export async function solve(input: P009Input) {
  const T = input.demands.length;
  const m = new Model("ProductionInventory");

  const regular = input.regCap.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `reg_${t}` })
  );
  const overtime = input.otCap.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `ot_${t}` })
  );
  const inventory = Array.from({ length: T }, (_, t) =>
    m.continuous({
      lb: t === T - 1 ? input.minFinalInventory : 0,
      ub: input.invCap,
      name: `inv_${t}`,
    })
  );

  // TODO:
  // 1. For each period t in 0..T-1, enforce:
  //    prev + regular[t] + overtime[t] - inventory[t] == input.demands[t]
  //    (where prev is input.initialInventory at t = 0, otherwise inventory[t - 1])
  // 2. Minimize total production + holding cost, solve, and return:
  //    { regular, overtime, inventory, totalCost }
  throw new Error("Not implemented");
}
