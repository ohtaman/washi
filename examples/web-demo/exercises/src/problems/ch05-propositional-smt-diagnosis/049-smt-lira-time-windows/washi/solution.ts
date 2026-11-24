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
  const n = input.shipments.length;
  const m = new Model("SmtLiraWindows");

  // express[i]: Boolean choice of express service for shipment i
  // expFlag[i] in {0, 1}: numeric mirror of express[i] for counting and linear cost terms
  // start[i], end[i]: continuous (>= 0) service start and completion times
  // tardy[i]: continuous (>= 0) lateness beyond dueTime
  const express = m.bool(n, { prefix: "exp" });
  const expFlag = m.binary(n, { prefix: "ef" });
  const start = m.continuous(n, { lb: 0, prefix: "s" });
  const end = m.continuous(n, { lb: 0, prefix: "end" });
  const tardy = m.continuous(n, { lb: 0, prefix: "tardy" });

  input.shipments.forEach((spec, i) => {
    // Channel Boolean express[i] into binary expFlag[i]
    m.constraint(implies(express[i], expr`${expFlag[i]} == 1`), `link_on_${i}`);
    m.constraint(implies(not(express[i]), expr`${expFlag[i]} == 0`), `link_off_${i}`);

    // Standard-mode time window and duration when express[i] is false
    m.constraint(
      implies(
        not(express[i]),
        and(
          expr`${start[i]} >= ${spec.stdWindow[0]}`,
          expr`${end[i]} == ${start[i]} + ${spec.stdDuration}`,
          expr`${end[i]} <= ${spec.stdWindow[1]}`
        )
      ),
      `std_mode_${i}`
    );

    // Express-mode time window and duration when express[i] is true
    m.constraint(
      implies(
        express[i],
        and(
          expr`${start[i]} >= ${spec.expWindow[0]}`,
          expr`${end[i]} == ${start[i]} + ${spec.expDuration}`,
          expr`${end[i]} <= ${spec.expWindow[1]}`
        )
      ),
      `exp_mode_${i}`
    );

    // Disjunctive blackout avoidance: finish before blackout starts or start after it ends
    m.constraint(
      or(expr`${end[i]} <= ${input.blackout[0]}`, expr`${start[i]} >= ${input.blackout[1]}`),
      `blackout_${i}`
    );

    // Tardiness lower bound: tardy[i] >= max(0, end[i] - dueTime)
    m.constraint(expr`${tardy[i]} >= ${end[i]} - ${spec.dueTime}`, `tardy_${i}`);
  });

  // Single-dock non-overlap: every pair of shipments must be sequenced
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      m.constraint(
        or(expr`${end[i]} <= ${start[j]}`, expr`${end[j]} <= ${start[i]}`),
        `dock_${i}_${j}`
      );
    }
  }

  // Cap total number of express shipments
  if (n > 0) {
    m.constraint(sum(expFlag).le(input.maxExpress), "max_express");
  }

  // Minimize total express fees plus weighted tardiness penalties
  const fees = input.shipments.map((s) => s.expFee);
  const penalties = input.shipments.map((s) => s.tardinessPenalty);
  m.objective(minimize(dot(fees, expFlag).add(dot(penalties, tardy))));

  await m.solve({ solver: "z3" });

  return {
    express: express.map((b) => Boolean(b.value)),
    startTimes: start.map((v) => v.value!),
    endTimes: end.map((v) => v.value!),
    totalCost: m.objectiveValue!,
  };
}
