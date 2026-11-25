import { Model, dot, expr, minimize } from "@ohtaman/washi";

export interface P069Input {
  baseLoads: number[];
  prices: number[];
  demandCharge: number;
  capacity: number;
  minSoc: number;
  initSoc: number;
  minFinalSoc: number;
  maxPower: number;
  etaCharge: number;
  etaDischarge: number;
}

export interface P069Output {
  charge: number[];
  discharge: number[];
  soc: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P069Input): Promise<P069Output> {
  const T = input.baseLoads.length;
  const m = new Model("BatteryPeakShaving");

  // charge[t], discharge[t]: battery power flows in [0, maxPower]
  const charge = m.continuous(T, { lb: 0, ub: input.maxPower, prefix: "chg" });
  const discharge = m.continuous(T, { lb: 0, ub: input.maxPower, prefix: "dis" });
  // mode[t]: binary mutually-exclusive indicator (1 = charging, 0 = discharging)
  const mode = m.binary(T, { prefix: "mode" });
  // soc[t]: state of charge in [minSoc, capacity]; terminal period T - 1 enforces >= minFinalSoc
  const soc = input.baseLoads.map((_, t) =>
    m.continuous({
      lb: t === T - 1 ? Math.max(input.minSoc, input.minFinalSoc) : input.minSoc,
      ub: input.capacity,
      name: `soc_${t}`,
    })
  );
  // gridLoad[t]: net power drawn from grid (>= 0); peakLoad: epigraph variable for max_t gridLoad[t]
  const gridLoad = m.continuous(T, { lb: 0, prefix: "grid" });
  const peakLoad = m.continuous("peakLoad", { lb: 0 });

  const invEtaD = 1 / input.etaDischarge;

  input.baseLoads.forEach((base, t) => {
    const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
    // Battery state-of-charge dynamics accounting for charge/discharge efficiencies
    m.constraint(
      expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
    );
    // Grid power balance: gridLoad = baseLoad + charge - discharge
    m.constraint(expr`${gridLoad[t]} - ${charge[t]} + ${discharge[t]} == ${base}`);
    // Peak demand epigraph bound
    m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
    // Prevent simultaneous charging and discharging via binary mode[t]
    m.constraint(expr`${charge[t]} <= ${input.maxPower} * ${mode[t]}`);
    m.constraint(expr`${discharge[t]} <= ${input.maxPower} * (1 - ${mode[t]})`);
  });

  // Objective: minimize time-of-use energy cost plus peak demand charge
  m.objective(
    minimize(
      expr`dot(${input.prices}, ${gridLoad}) + ${input.demandCharge} * ${peakLoad}`
    )
  );
  await m.solve();

  return {
    charge: charge.map((v) => v.value!),
    discharge: discharge.map((v) => v.value!),
    soc: soc.map((v) => v.value!),
    peakLoad: peakLoad.value!,
    totalCost: m.objectiveValue!,
  };
}
