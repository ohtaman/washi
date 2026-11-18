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

  for (let t = 0; t < T; t++) {
    const prev = t === 0 ? input.initialOutput : outputs[t - 1];
    m.constraint(expr`${rampUp[t]} >= ${outputs[t]} - ${prev}`, `ramp_${t}`);
  }

  m.objective(
    minimize(expr`${input.runCost} * ${sum(outputs)} + ${input.rampCost} * ${sum(rampUp)}`)
  );

  const status = await m.solve();
  if (status !== "Optimal") {
    throw new Error(`Expected Optimal, got ${status}`);
  }

  return {
    outputs: outputs.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
