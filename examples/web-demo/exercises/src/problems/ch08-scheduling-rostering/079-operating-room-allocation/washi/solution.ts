import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P079Input {
  durations: number[];
  priorities: number[];
  compatible: number[][];
  numSessions: number;
  regularCapacity: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedRoom: number[];
  assignedSession: number[];
  overtime: number[][];
  netScore: number;
}

export async function solve(input: P079Input): Promise<P079Output> {
  const C = input.durations.length;
  const R = input.compatible[0].length;
  const S = input.numSessions;
  const m = new Model("OperatingRoomAllocation");

  const x = Array.from({ length: C }, (_, c) =>
    Array.from({ length: R }, (_, r) =>
      Array.from({ length: S }, (_, s) => m.binary(`x_${c}_${r}_${s}`))
    )
  );
  const overtime = Array.from({ length: R }, (_, r) =>
    Array.from({ length: S }, (_, s) =>
      m.continuous({ lb: 0, ub: input.maxOvertime, name: `ot_${r}_${s}` })
    )
  );

  x.forEach((caseRooms, c) => {
    m.constraint(expr`${sum(caseRooms.flat())} <= 1`);
    caseRooms.forEach((roomSessions, r) => {
      if (input.compatible[c][r] === 0) {
        m.constraint(expr`${sum(roomSessions)} == 0`);
      }
    });
  });

  for (let r = 0; r < R; r++) {
    for (let s = 0; s < S; s++) {
      const load = sum(x.map((caseRooms, c) => expr`${input.durations[c]} * ${caseRooms[r][s]}`));
      m.constraint(expr`${load} <= ${input.regularCapacity} + ${overtime[r][s]}`);
    }
  }

  const totalPriority = sum(
    x.map((caseRooms, c) => expr`${input.priorities[c]} * ${sum(caseRooms.flat())}`)
  );
  const totalOvertimeCost = expr`${input.overtimeCost} * ${sum(overtime.flat())}`;
  m.objective(maximize(expr`${totalPriority} - ${totalOvertimeCost}`));
  await m.solve();

  const assignedRoom = new Array<number>(C).fill(-1);
  const assignedSession = new Array<number>(C).fill(-1);
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      const s = x[c][r].findIndex((v) => Math.round(v.value!) === 1);
      if (s !== -1) {
        assignedRoom[c] = r;
        assignedSession[c] = s;
      }
    }
  }

  return {
    assignedRoom,
    assignedSession,
    overtime: overtime.map((row) => row.map((v) => Math.max(0, v.value!) || 0)),
    netScore: m.objectiveValue!,
  };
}
