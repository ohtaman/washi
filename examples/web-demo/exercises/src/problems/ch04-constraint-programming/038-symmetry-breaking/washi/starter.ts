import { Model, expr, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P038Input {
  numHosts: number;
  capacity: number;
  sizes: number[];
  conflicts: number[][];
}

export interface P038Output {
  hosts: number[];
  usedHosts: number;
}

export async function solve(input: P038Input): Promise<P038Output> {
  const n = input.sizes.length;
  const K = input.numHosts;
  const hostIndices = Array.from({ length: K }, (_, k) => k);
  const m = new Model("HostPackingSymmetry");

  // TODO: Model VM-to-host placement, capacity, anti-affinity, symmetry breaking, and objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
