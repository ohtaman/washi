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

export interface P009Output {
  regular: number[];
  overtime: number[];
  inventory: number[];
  totalCost: number;
}

export async function solve(input: P009Input): Promise<P009Output> {
  const T = input.demands.length;
  const m = new Model("ProductionInventory");

  const regular = input.regCap.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `reg_${t}` })
  );
  const overtime = input.otCap.map((ub, t) =>
    m.continuous({ lb: 0, ub, name: `ot_${t}` })
  );
  const inventory = input.demands.map((_, t) =>
    m.continuous({
      lb: t === T - 1 ? input.minFinalInventory : 0,
      ub: input.invCap,
      name: `inv_${t}`,
    })
  );

  m.constraint(
    input.demands.map((demand, t) => {
      const prev = t === 0 ? input.initialInventory : inventory[t - 1];
      return expr`${prev} + ${regular[t]} + ${overtime[t]} - ${inventory[t]} == ${demand}`;
    })
  );

  m.objective(
    minimize(
      expr`${input.regCost} * ${sum(regular)} + ${input.otCost} * ${sum(overtime)} + ${input.holdCost} * ${sum(inventory)}`
    )
  );
  await m.solve();

  return {
    regular: regular.map((v) => v.value!),
    overtime: overtime.map((v) => v.value!),
    inventory: inventory.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
