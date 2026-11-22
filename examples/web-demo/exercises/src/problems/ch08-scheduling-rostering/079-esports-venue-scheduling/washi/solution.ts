import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P079Input {
  durations: number[];
  scores: number[];
  compatible: number[][];
  numSlots: number;
  regularLength: number;
  maxOvertime: number;
  overtimeCost: number;
}

export interface P079Output {
  assignedVenue: number[];
  assignedSlot: number[];
  overtime: number[][];
  netScore: number;
}

export async function solve(input: P079Input): Promise<P079Output> {
  const M = input.durations.length;
  const V = input.compatible[0].length;
  const S = input.numSlots;
  const model = new Model("EsportsVenueScheduling");

  const x = Array.from({ length: M }, (_, m) =>
    Array.from({ length: V }, (_, v) =>
      Array.from({ length: S }, (_, s) => model.binary(`x_${m}_${v}_${s}`))
    )
  );
  const overtime = Array.from({ length: V }, (_, v) =>
    Array.from({ length: S }, (_, s) =>
      model.continuous({ lb: 0, ub: input.maxOvertime, name: `ot_${v}_${s}` })
    )
  );

  x.forEach((matchVenues, m) => {
    model.constraint(expr`${sum(matchVenues.flat())} <= 1`);
    matchVenues.forEach((venueSlots, v) => {
      if (input.compatible[m][v] === 0) {
        model.constraint(expr`${sum(venueSlots)} == 0`);
      }
    });
  });

  for (let v = 0; v < V; v++) {
    for (let s = 0; s < S; s++) {
      const load = sum(x.map((matchVenues, m) => expr`${input.durations[m]} * ${matchVenues[v][s]}`));
      model.constraint(expr`${load} <= ${input.regularLength} + ${overtime[v][s]}`);
    }
  }

  const totalScore = sum(
    x.map((matchVenues, m) => expr`${input.scores[m]} * ${sum(matchVenues.flat())}`)
  );
  const totalOvertimeCost = expr`${input.overtimeCost} * ${sum(overtime.flat())}`;
  model.objective(maximize(expr`${totalScore} - ${totalOvertimeCost}`));
  await model.solve();

  const assignedVenue = new Array<number>(M).fill(-1);
  const assignedSlot = new Array<number>(M).fill(-1);
  for (let m = 0; m < M; m++) {
    for (let v = 0; v < V; v++) {
      const s = x[m][v].findIndex((varRef) => Math.round(varRef.value!) === 1);
      if (s !== -1) {
        assignedVenue[m] = v;
        assignedSlot[m] = s;
      }
    }
  }

  return {
    assignedVenue,
    assignedSlot,
    overtime: overtime.map((row) => row.map((v) => Math.max(0, v.value!) || 0)),
    netScore: model.objectiveValue!,
  };
}
