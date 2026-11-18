import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P008Input {
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

export async function solve(input: P008Input) {
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

  for (let t = 0; t < T; t++) {
    const prev = t === 0 ? input.initialInventory : inventory[t - 1];
    m.constraint(
      expr`${prev} + ${regular[t]} + ${overtime[t]} - ${inventory[t]} == ${input.demands[t]}`,
      `balance_${t}`
    );
  }

  m.objective(
    minimize(
      expr`${input.regCost} * ${sum(regular)} + ${input.otCost} * ${sum(overtime)} + ${input.holdCost} * ${sum(inventory)}`
    )
  );

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    regular: regular.map((v) => v.value!),
    overtime: overtime.map((v) => v.value!),
    inventory: inventory.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
