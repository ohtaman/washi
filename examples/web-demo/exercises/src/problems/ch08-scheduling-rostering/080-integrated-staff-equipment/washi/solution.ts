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

  x.forEach((jobStaff, j) => {
    m.constraint(expr`${sum(jobStaff.flat())} == 1`);
    jobStaff.forEach((staffSlots, i) => {
      if (input.certified[i][j] === 0) {
        m.constraint(expr`${sum(staffSlots)} == 0`);
      }
    });
  });

  for (let i = 0; i < N; i++) {
    for (let t = 0; t < T; t++) {
      m.constraint(expr`${sum(x.map((jobStaff) => jobStaff[i][t]))} <= 1`);
    }
    const staffLoad = sum(x.flatMap((jobStaff) => jobStaff[i]));
    m.constraint([
      expr`${staffLoad} <= ${input.maxLimits[i]}`,
      expr`${overtime[i]} >= ${staffLoad} - ${input.regularLimits[i]}`,
    ]);
  }

  for (let t = 0; t < T; t++) {
    const eqUsed = sum(
      x.flatMap((jobStaff, j) =>
        jobStaff.map((staffSlots) => expr`${input.equipNeeds[j]} * ${staffSlots[t]}`)
      )
    );
    m.constraint(expr`${eqUsed} <= ${input.equipCap}`);
  }

  const assignCost = sum(
    x.flatMap((jobStaff, j) =>
      jobStaff.flatMap((staffSlots, i) =>
        staffSlots.map(
          (v, t) => expr`${input.staffCosts[i] + input.slotPenalties[j][t]} * ${v}`
        )
      )
    )
  );
  m.objective(
    minimize(expr`${assignCost} + dot(${input.overtimeCosts}, ${overtime})`)
  );
  await m.solve();

  const assignedStaff = new Array<number>(J);
  const assignedSlot = new Array<number>(J);
  for (let j = 0; j < J; j++) {
    for (let i = 0; i < N; i++) {
      const t = x[j][i].findIndex((v) => Math.round(v.value!) === 1);
      if (t !== -1) {
        assignedStaff[j] = i;
        assignedSlot[j] = t;
      }
    }
  }

  return {
    assignedStaff,
    assignedSlot,
    overtime: overtime.map((v) => Math.max(0, v.value!) || 0),
    totalCost: m.objectiveValue!,
  };
}
