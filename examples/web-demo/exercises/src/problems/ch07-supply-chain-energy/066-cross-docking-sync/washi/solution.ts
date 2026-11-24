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
  const nIn = input.supplies.length;
  const nOut = input.demands.length;
  const nComms = input.supplies[0]?.length ?? 0;
  const R = input.inDoorCaps.length;
  const S = input.outDoorCaps.length;

  const m = new Model("CrossDockingSync");

  // x[i][r]: 1 if inbound truck i is assigned to receiving door r (binary)
  const x = m.binary(nIn, R, { prefix: "x" });
  // y[j][s]: 1 if outbound truck j is assigned to shipping door s (binary)
  const y = m.binary(nOut, S, { prefix: "y" });
  // z[i][j]: 1 if any cargo is transferred from inbound truck i to outbound truck j (binary)
  const z = m.binary(nIn, nOut, { prefix: "z" });
  // f[i][j][k]: units of commodity k transferred from inbound i to outbound j (>= 0)
  const f = Array.from({ length: nIn }, (_, i) =>
    Array.from({ length: nOut }, (__, j) =>
      m.continuous(nComms, { lb: 0, prefix: `f_${i}_${j}` })
    )
  );
  // w[i][j][r][s]: total flow from i to j routed through door pair (r, s), linearizing x[i][r] * y[j][s] * f[i][j]
  const w = Array.from({ length: nIn }, (_, i) =>
    Array.from({ length: nOut }, (__, j) =>
      m.continuous(R, S, { lb: 0, prefix: `w_${i}_${j}` })
    )
  );
  // dep[j], tard[j]: outbound truck j departure time and tardiness beyond dueTimes[j] (>= 0)
  const dep = m.continuous(nOut, { lb: 0, prefix: "dep" });
  const tard = m.continuous(nOut, { lb: 0, prefix: "tard" });

  // Each truck uses exactly one door; each door respects its truck capacity
  m.constraint(x.map((row) => expr`${sum(row)} == 1`));
  m.constraint(
    input.inDoorCaps.map(
      (cap, r) => expr`${sum(x.map((row) => row[r]))} <= ${cap}`
    )
  );
  m.constraint(y.map((row) => expr`${sum(row)} == 1`));
  m.constraint(
    input.outDoorCaps.map(
      (cap, s) => expr`${sum(y.map((row) => row[s]))} <= ${cap}`
    )
  );

  // Commodity supply & demand conservation across inbound and outbound trucks
  for (let k = 0; k < nComms; k++) {
    m.constraint(
      input.supplies.map(
        (sup, i) => expr`${sum(f[i].map((row) => row[k]))} <= ${sup[k]}`
      )
    );
    m.constraint(
      input.demands.map(
        (dem, j) => expr`${sum(f.map((row) => row[j][k]))} == ${dem[k]}`
      )
    );
  }

  // Tight big-M for departure synchronization: max possible (arrival + transfer) time
  const maxArr = Math.max(...input.arrivalTimes);
  const maxTrans = Math.max(...input.transferTimes.flat());
  const bigMT = maxArr + maxTrans;

  for (let i = 0; i < nIn; i++) {
    for (let j = 0; j < nOut; j++) {
      // Tight upper bound on total transferable flow between i and j
      let maxPairFlow = 0;
      for (let k = 0; k < nComms; k++) {
        maxPairFlow += Math.min(input.supplies[i][k], input.demands[j][k]);
      }
      const pairFlowSum = sum(f[i][j]);
      // Activate transfer indicator z[i][j] if any cargo flows from i to j
      m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
      // Conserve pair flow across door-pair disaggregated variables w[i][j][r][s]
      m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);

      // Route w[i][j][r][s] only through the doors assigned to truck i and truck j
      for (let r = 0; r < R; r++) {
        m.constraint(expr`${sum(w[i][j][r])} <= ${maxPairFlow} * ${x[i][r]}`);
      }
      for (let s = 0; s < S; s++) {
        m.constraint(
          expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`
        );
      }

      // Big-M synchronization: if i->j transfers (z=1) via doors r (x=1) and s (y=1), dep[j] >= arrival[i] + transfer[r][s]
      for (let r = 0; r < R; r++) {
        for (let s = 0; s < S; s++) {
          const rhs = input.arrivalTimes[i] + input.transferTimes[r][s] - 3 * bigMT;
          m.constraint(
            expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`
          );
        }
      }
    }
  }

  // Tardiness definition: tard[j] >= max(0, dep[j] - dueTimes[j])
  m.constraint(
    input.dueTimes.map((due, j) => expr`${tard[j]} >= ${dep[j]} - ${due}`)
  );

  // Objective: minimize door-pair handling costs plus outbound departure delay penalties
  const handlingExpr = sum(
    w.flatMap((rowI) =>
      rowI.flatMap((mat) =>
        mat.flatMap((rowR, r) =>
          rowR.map((v, s) => expr`${input.handlingCosts[r][s]} * ${v}`)
        )
      )
    )
  );
  m.objective(
    minimize(expr`${handlingExpr} + ${input.delayCost} * ${sum(tard)}`)
  );
  await m.solve();

  return {
    // Round binary door indicators to avoid solver tolerance drift when finding assigned door index
    inDoor: x.map((row) => row.findIndex((v) => Math.round(v.value!) === 1)),
    outDoor: y.map((row) => row.findIndex((v) => Math.round(v.value!) === 1)),
    flows: f.map((rowI) => rowI.map((rowJ) => rowJ.map((v) => v.value!))),
    departures: dep.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
