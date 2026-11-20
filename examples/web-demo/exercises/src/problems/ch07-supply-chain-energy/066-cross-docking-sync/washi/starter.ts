import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P066Input {
  supplies: number[][];
  demands: number[][];
  arrivalTimes: number[];
  dueTimes: number[];
  inDoorCaps: number[];
  outDoorCaps: number[];
  handlingCosts: number[][];
  transferTimes: number[][];
  delayCost: number;
}

export interface P066Output {
  inDoor: number[];
  outDoor: number[];
  flows: number[][][];
  departures: number[];
  totalCost: number;
}

export async function solve(input: P066Input): Promise<P066Output> {
  const m = new Model("CrossDockingSync");

  // TODO:
  // 1. Assign each inbound truck i to one inbound door r (respecting inDoorCaps) and each outbound truck j to one outbound door s (respecting outDoorCaps)
  // 2. Route commodity flows f[i][j][k] from inbound supplies to outbound demands
  // 3. Linearize door-pair transfer flow w[i][j][r][s] and active link indicator z[i][j]
  // 4. Enforce departure sync departures[j] >= arrivalTimes[i] + transferTimes[r][s] when x[i][r]=y[j][s]=z[i][j]=1
  // 5. Minimize handling + tardiness cost, await m.solve(), and return { inDoor, outDoor, flows, departures, totalCost }
  throw new Error("Not implemented");
}
