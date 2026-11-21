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
  // TODO: Model mode choices, time windows, blackout/dock disjunctions, and tardiness, then minimize total cost with Z3.
  throw new Error("Not implemented");
}
