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

  const express = m.bool(n, { prefix: "exp" });
  const expFlag = m.binary(n, { prefix: "ef" });
  const start = m.continuous(n, { lb: 0, prefix: "s" });
  const end = m.continuous(n, { lb: 0, prefix: "end" });
  const tardy = m.continuous(n, { lb: 0, prefix: "tardy" });

  input.shipments.forEach((spec, i) => {
    m.constraint(implies(express[i], expr`${expFlag[i]} == 1`), `link_on_${i}`);
    m.constraint(implies(not(express[i]), expr`${expFlag[i]} == 0`), `link_off_${i}`);

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

    m.constraint(
      or(expr`${end[i]} <= ${input.blackout[0]}`, expr`${start[i]} >= ${input.blackout[1]}`),
      `blackout_${i}`
    );

    m.constraint(expr`${tardy[i]} >= ${end[i]} - ${spec.dueTime}`, `tardy_${i}`);
  });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      m.constraint(
        or(expr`${end[i]} <= ${start[j]}`, expr`${end[j]} <= ${start[i]}`),
        `dock_${i}_${j}`
      );
    }
  }

  if (n > 0) {
    m.constraint(sum(expFlag).le(input.maxExpress), "max_express");
  }

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
