import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P078Input {
  courseSizes: number[];
  roomCapacities: number[];
  teachers: number[];
  cohorts: number[][];
  slotScores: number[][];
}

export interface P078Output {
  rooms: number[];
  slots: number[];
  totalScore: number;
}

export async function solve(input: P078Input): Promise<P078Output> {
  const C = input.courseSizes.length;
  const R = input.roomCapacities.length;
  const T = input.slotScores[0].length;
  const m = new Model("UniversityTimetabling");

  const x = Array.from({ length: C }, (_, c) =>
    Array.from({ length: R }, (_, r) =>
      Array.from({ length: T }, (_, t) => m.binary(`x_${c}_${r}_${t}`))
    )
  );

  x.forEach((courseRooms, c) => {
    m.constraint(expr`${sum(courseRooms.flat())} == 1`);
    courseRooms.forEach((roomSlots, r) => {
      if (input.courseSizes[c] > input.roomCapacities[r]) {
        m.constraint(expr`${sum(roomSlots)} == 0`);
      }
    });
  });

  for (let r = 0; r < R; r++) {
    for (let t = 0; t < T; t++) {
      m.constraint(expr`${sum(x.map((courseRooms) => courseRooms[r][t]))} <= 1`);
    }
  }

  const teacherGroups = new Map<number, number[]>();
  input.teachers.forEach((tc, c) => {
    const list = teacherGroups.get(tc) ?? [];
    list.push(c);
    teacherGroups.set(tc, list);
  });

  const cohortGroups = new Map<number, number[]>();
  input.cohorts.forEach((cList, c) => {
    cList.forEach((g) => {
      const list = cohortGroups.get(g) ?? [];
      list.push(c);
      cohortGroups.set(g, list);
    });
  });

  for (const group of [...teacherGroups.values(), ...cohortGroups.values()]) {
    if (group.length < 2) continue;
    for (let t = 0; t < T; t++) {
      const vars = group.flatMap((c) => x[c].map((roomSlots) => roomSlots[t]));
      m.constraint(expr`${sum(vars)} <= 1`);
    }
  }

  m.objective(
    maximize(
      sum(
        x.flatMap((courseRooms, c) =>
          courseRooms.flatMap((roomSlots) =>
            roomSlots.map((v, t) => expr`${input.slotScores[c][t]} * ${v}`)
          )
        )
      )
    )
  );
  await m.solve();

  const rooms = new Array<number>(C);
  const slots = new Array<number>(C);
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      const t = x[c][r].findIndex((v) => Math.round(v.value!) === 1);
      if (t !== -1) {
        rooms[c] = r;
        slots[c] = t;
      }
    }
  }

  return {
    rooms,
    slots,
    totalScore: m.objectiveValue!,
  };
}
