import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P070Input {
  demands: number[];
  setupCost: number;
  holdCost: number;
  prodCap: number;
  setupPower: number;
  unitPower: number;
  baseLoads: number[];
  prices: number[];
  demandCharge: number;
  batteryCap: number;
  initSoc: number;
  maxPower: number;
  etaCharge: number;
  etaDischarge: number;
}

export interface P070Output {
  setups: number[];
  production: number[];
  inventory: number[];
  charge: number[];
  discharge: number[];
  soc: number[];
  peakLoad: number;
  totalCost: number;
}

export async function solve(input: P070Input): Promise<P070Output> {
  const T = input.demands.length;
  const m = new Model("EnergyCoupledSCM");

  const setups = m.binary(T, { prefix: "y" });
  const production = m.continuous(T, { lb: 0, ub: input.prodCap, prefix: "x" });
  const inventory = m.continuous(T, { lb: 0, prefix: "inv" });

  const charge = m.continuous(T, { lb: 0, ub: input.maxPower, prefix: "chg" });
  const discharge = m.continuous(T, { lb: 0, ub: input.maxPower, prefix: "dis" });
  const mode = m.binary(T, { prefix: "mode" });
  const soc = input.demands.map((_, t) =>
    m.continuous({
      lb: t === T - 1 ? input.initSoc : 0,
      ub: input.batteryCap,
      name: `soc_${t}`,
    })
  );
  const gridLoad = m.continuous(T, { lb: 0, prefix: "grid" });
  const peakLoad = m.continuous("peakLoad", { lb: 0 });

  const invEtaD = 1 / input.etaDischarge;

  input.demands.forEach((demand, t) => {
    const prevInv = t === 0 ? 0 : inventory[t - 1];
    m.constraint(expr`${production[t]} <= ${input.prodCap} * ${setups[t]}`);
    m.constraint(
      expr`${prevInv} + ${production[t]} - ${inventory[t]} == ${demand}`
    );

    const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
    m.constraint(
      expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
    );

    m.constraint(
      expr`${gridLoad[t]} - ${input.setupPower} * ${setups[t]} - ${input.unitPower} * ${production[t]} - ${charge[t]} + ${discharge[t]} == ${input.baseLoads[t]}`
    );
    m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
    m.constraint(expr`${charge[t]} <= ${input.maxPower} * ${mode[t]}`);
    m.constraint(expr`${discharge[t]} <= ${input.maxPower} * (1 - ${mode[t]})`);
  });

  m.objective(
    minimize(
      expr`${input.setupCost} * ${sum(setups)} + ${input.holdCost} * ${sum(inventory)} + dot(${input.prices}, ${gridLoad}) + ${input.demandCharge} * ${peakLoad}`
    )
  );
  await m.solve();

  return {
    setups: setups.map((v) => Math.round(v.value!) || 0),
    production: production.map((v) => v.value!),
    inventory: inventory.map((v) => v.value!),
    charge: charge.map((v) => v.value!),
    discharge: discharge.map((v) => v.value!),
    soc: soc.map((v) => v.value!),
    peakLoad: peakLoad.value!,
    totalCost: m.objectiveValue!,
  };
}
