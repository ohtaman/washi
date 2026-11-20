import { Model, dot, expr, minimize, sum } from "@ohtaman/washi";

export interface P092Input {
  weights: number[];
  binCapacity: number;
}

export interface P092Output {
  assignments: number[];
  binsUsed: number;
  lpBound: number;
}

function buildExtendedCovers(
  weights: number[],
  binCapacity: number
): Array<{ items: number[]; rhsMult: number }> {
  const cuts: Array<{ items: number[]; rhsMult: number }> = [];
  const seen = new Set<string>();

  function dfs(
    start: number,
    cur: number[],
    sumW: number,
    minW: number,
    maxW: number
  ): void {
    if (sumW > binCapacity) {
      if (sumW - minW <= binCapacity) {
        const ext: number[] = [];
        for (let j = 0; j < weights.length; j++) {
          if (cur.includes(j) || weights[j] >= maxW) {
            ext.push(j);
          }
        }
        const key = `${ext.join(",")}|${cur.length - 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          cuts.push({ items: ext, rhsMult: cur.length - 1 });
        }
      }
      return;
    }
    for (let nxt = start; nxt < weights.length; nxt++) {
      cur.push(nxt);
      dfs(
        nxt + 1,
        cur,
        sumW + weights[nxt],
        Math.min(minW, weights[nxt]),
        Math.max(maxW, weights[nxt])
      );
      cur.pop();
    }
  }

  dfs(0, [], 0, Infinity, 0);
  return cuts;
}

export async function solve(input: P092Input): Promise<P092Output> {
  const n = input.weights.length;
  const m = new Model("BinPackingCoverCuts");

  const used = m.binary(n, { prefix: "used" });
  const assign = m.binary(n, n, { prefix: "assign" });

  for (let i = 0; i < n; i++) {
    m.constraint(expr`sum(${assign[i]}) == 1`, `item_${i}`);
    for (let k = i + 1; k < n; k++) {
      m.constraint(expr`${assign[i][k]} == 0`, `sym_idx_${i}_${k}`);
    }
  }

  for (let k = 0; k < n; k++) {
    const binCol = assign.map((row) => row[k]);
    m.constraint(
      expr`dot(${input.weights}, ${binCol}) <= ${input.binCapacity} * ${used[k]}`,
      `bin_cap_${k}`
    );
  }

  for (let k = 0; k < n - 1; k++) {
    m.constraint(expr`${used[k]} >= ${used[k + 1]}`, `sym_order_${k}`);
  }

  const totalWeight = input.weights.reduce((acc, w) => acc + w, 0);
  m.constraint(
    expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`,
    "global_capacity_cut"
  );

  const covers = buildExtendedCovers(input.weights, input.binCapacity);
  covers.forEach((cut, cIdx) => {
    for (let k = 0; k < n; k++) {
      const varsInBin = cut.items.map((i) => assign[i][k]);
      m.constraint(
        expr`sum(${varsInBin}) <= ${cut.rhsMult} * ${used[k]}`,
        `cover_${cIdx}_${k}`
      );
    }
  });

  m.objective(minimize(expr`sum(${used})`));

  await m.relax();
  const lpBound = m.objectiveValue!;

  await m.solve();

  const assignments = assign.map((row) =>
    row.findIndex((v) => Math.round(v.value!) === 1)
  );

  return {
    assignments,
    binsUsed: Math.round(m.objectiveValue!) || 0,
    lpBound,
  };
}
