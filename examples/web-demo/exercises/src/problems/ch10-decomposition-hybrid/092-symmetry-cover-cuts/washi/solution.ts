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

// Enumerate minimal knapsack covers C (sum > binCapacity, minimal) and lift to extended covers E = C U {j : w_j >= max_{i in C} w_i}
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

  // used[k] = 1 if bin k is opened; assign[i][k] = 1 if item i is placed in bin k
  const used = m.binary(n, { prefix: "used" });
  const assign = m.binary(n, n, { prefix: "assign" });

  // Each item is assigned to one bin; symmetry breaking forbids placing item i in a bin with index > i
  for (let i = 0; i < n; i++) {
    m.constraint(expr`sum(${assign[i]}) == 1`, `item_${i}`);
    for (let k = i + 1; k < n; k++) {
      m.constraint(expr`${assign[i][k]} == 0`, `sym_idx_${i}_${k}`);
    }
  }

  // Bin capacity linking: items in bin k cannot exceed binCapacity when bin k is used
  for (let k = 0; k < n; k++) {
    const binCol = assign.map((row) => row[k]);
    m.constraint(
      expr`dot(${input.weights}, ${binCol}) <= ${input.binCapacity} * ${used[k]}`,
      `bin_cap_${k}`
    );
  }

  // Symmetry-breaking ordering: open lower-indexed bins before higher-indexed ones
  for (let k = 0; k < n - 1; k++) {
    m.constraint(expr`${used[k]} >= ${used[k + 1]}`, `sym_order_${k}`);
  }

  // Global volume lower-bound cut: at least ceil(sum(weights) / binCapacity) bins are needed
  const totalWeight = input.weights.reduce((acc, w) => acc + w, 0);
  m.constraint(
    expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`,
    "global_capacity_cut"
  );

  // Extended cover cuts: at most (|C| - 1) items from an extended cover can fit in any single open bin
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

  // Minimize total bins used; evaluate tightened LP bound before solving MIP
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
