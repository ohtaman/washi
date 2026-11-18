import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P005Input {
  demands: number[];
  maxOutput: number;
  initialOutput: number;
  runCost: number;
  rampCost: number;
}

export async function solve(input: P005Input) {
  const T = input.demands.length;
  const m = new Model("RampPositivePart");

  const outputs = input.demands.map((d, t) =>
    m.continuous({ lb: d, ub: input.maxOutput, name: `o_${t}` })
  );
  const rampUp = m.continuous(T, { lb: 0, prefix: "u" });

  // TODO:
  // 1. Add linear constraints capturing upward ramping only: rampUp[t] >= outputs[t] - prev
  // 2. Minimize runCost * sum(outputs) + rampCost * sum(rampUp)
  // 3. Solve and return { outputs, totalCost }
  throw new Error("Not implemented");
}
