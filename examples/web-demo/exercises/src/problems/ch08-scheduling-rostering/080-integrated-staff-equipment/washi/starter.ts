import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P080Input {
  certified: number[][];
  equipNeeds: number[];
  equipCap: number;
  slotPenalties: number[][];
  staffCosts: number[];
  regularLimits: number[];
  maxLimits: number[];
  overtimeCosts: number[];
}

export interface P080Output {
  assignedStaff: number[];
  assignedSlot: number[];
  overtime: number[];
  totalCost: number;
}

export async function solve(input: P080Input): Promise<P080Output> {
  const N = input.certified.length;
  const J = input.equipNeeds.length;
  const T = input.slotPenalties[0].length;
  const m = new Model("IntegratedStaffEquipment");

  const x = Array.from({ length: J }, (_, j) =>
    Array.from({ length: N }, (_, i) =>
      Array.from({ length: T }, (_, t) => m.binary(`x_${j}_${i}_${t}`))
    )
  );
  const overtime = input.maxLimits.map((ub, i) =>
    m.continuous({ lb: 0, ub, name: `ot_${i}` })
  );

  // TODO:
  // 1. Assign every job j to exactly 1 certified (staff i, slot t)
  // 2. Enforce at most 1 job per (staff i, slot t) and shared equipment <= equipCap per slot t
  // 3. Enforce staff total load <= maxLimits[i] and overtime[i] >= work[i] - regularLimits[i]
  // 4. Minimize staffCosts + overtimeCosts + slotPenalties, solve, and decode assignedStaff, assignedSlot, overtime
  throw new Error("Not implemented");
}
