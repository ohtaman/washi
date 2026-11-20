import {
  Model,
  and,
  dot,
  expr,
  implies,
  minimize,
  not,
  or,
  sum,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export interface ShipmentSpec {
  stdWindow: [number, number];
  expWindow: [number, number];
  stdDuration: number;
  expDuration: number;
  expFee: number;
  dueTime: number;
  tardinessPenalty: number;
}

export interface P049Input {
  shipments: ShipmentSpec[];
  blackout: [number, number];
  maxExpress: number;
}

export interface P049Output {
  express: boolean[];
  startTimes: number[];
  endTimes: number[];
  totalCost: number;
}

export async function solve(input: P049Input): Promise<P049Output> {
  // TODO:
  // 1. Declare express (m.bool), expFlag (m.binary), and continuous start/end/tardy variables.
  // 2. Link express[i] with expFlag[i], enforce mode-dependent windows/durations via implies(...),
  //    blackout avoidance via or(end[i] <= blackout[0], start[i] >= blackout[1]),
  //    pairwise dock non-overlap via or(end[i] <= start[j], end[j] <= start[i]),
  //    sum(expFlag) <= maxExpress, and tardy[i] >= end[i] - dueTime.
  // 3. Minimize express fees + tardiness penalties via await m.solve({ solver: "z3" }).
  throw new Error("Not implemented");
}
