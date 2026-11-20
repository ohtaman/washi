import { Model, distinct, expr, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P031Input {
  numChannels: number;
  weights: number[];
  adjacentConflicts: number[][];
}

export interface P031Output {
  channels: number[];
  totalCost: number;
}

export async function solve(input: P031Input): Promise<P031Output> {
  const n = input.weights.length;
  const m = new Model("DistinctChannelAssignment");

  const channels = m.integer(n, {
    lb: 0,
    ub: input.numChannels - 1,
    prefix: "ch",
  });

  // TODO: Enforce that every transmitter uses a distinct channel with distinct(channels)

  m.constraint(
    input.adjacentConflicts.map(
      ([u, v]) => expr`abs(${channels[u]} - ${channels[v]}) >= 2`
    )
  );

  m.objective(minimize(expr`dot(${input.weights}, ${channels})`));
  await m.solve({ solver: "pumpkin" });

  return {
    channels: channels.map((v) => Math.round(v.value!) || 0),
    totalCost: Math.round(m.objectiveValue!) || 0,
  };
}
