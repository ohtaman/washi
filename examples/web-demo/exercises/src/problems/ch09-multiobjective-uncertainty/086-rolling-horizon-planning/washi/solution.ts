import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P086Input {
  actualDemands: number[];
  forecastDemands: number[];
  prodCosts: number[];
  prodCap: number;
  holdCost: number;
  shortfallPenalty: number;
  initialInventory: number;
  windowLen: number;
}

export interface P086Output {
  produced: number[];
  inventories: number[];
  shortfalls: number[];
  totalCost: number;
}

export async function solve(input: P086Input): Promise<P086Output> {
  const T = input.actualDemands.length;
  let invCurr = input.initialInventory;
  let totalCost = 0;
  const produced: number[] = [];
  const inventories: number[] = [];
  const shortfalls: number[] = [];

  for (let t = 0; t < T; t++) {
    const end = Math.min(T, t + input.windowLen);
    const L = end - t;
    const m = new Model(`MPC_${t}`);

    const x = m.continuous(L, { lb: 0, ub: input.prodCap, prefix: "x" });
    const inv = m.continuous(L, { lb: 0, prefix: "inv" });
    const sh = m.continuous(L, { lb: 0, prefix: "sh" });

    m.constraint(
      Array.from({ length: L }, (_, k) => {
        const prev = k === 0 ? invCurr : inv[k - 1];
        return expr`${prev} + ${x[k]} + ${sh[k]} - ${inv[k]} == ${input.forecastDemands[t + k]}`;
      })
    );

    const windowCosts = input.prodCosts.slice(t, end);
    m.objective(
      minimize(
        expr`dot(${windowCosts}, ${x}) + ${input.holdCost} * sum(${inv}) + ${input.shortfallPenalty} * sum(${sh})`
      )
    );
    await m.solve();

    const xt = x[0].value!;
    const supply = invCurr + xt;
    const actualDemand = input.actualDemands[t];
    const nextInv = Math.max(0, supply - actualDemand);
    const realizedShort = Math.max(0, actualDemand - supply);

    produced.push(xt);
    inventories.push(nextInv);
    shortfalls.push(realizedShort);
    totalCost +=
      input.prodCosts[t] * xt +
      input.holdCost * nextInv +
      input.shortfallPenalty * realizedShort;
    invCurr = nextInv;
  }

  return { produced, inventories, shortfalls, totalCost };
}
