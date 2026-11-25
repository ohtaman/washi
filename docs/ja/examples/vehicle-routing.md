# 車両配送計画問題（列生成法による CVRP）

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` (`sum`) | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="/ja/guide/decomposition">分解法ガイド</a></li></ul> |

この例で扱う **容量制約付き車両配送計画問題（CVRP）** では、全顧客を訪問するのに必要な最小車両数と各車両の配送ルートを求めます。各ルートは積載容量に加え、1 便の最大訪問件数と稼働時間上限を満たす必要があります。

実行可能な全ルート候補を事前に列挙する定式化では、顧客数 $n$ の増加に伴い変数数が組合せ的に爆発します（顧客の部分集合だけでも一般には $O(2^n)$ 通り、訪問順序まで区別するとさらに増大します）。**列生成法（Dantzig-Wolfe 分解）** を使うと、必要なルートだけを反復的に追加できます。
1. **制限主問題（RMP）**: 生成済みルート候補から、各顧客をちょうど 1 回訪問する集合分割問題の **LP 緩和**（最後に MIP）を解きます。
2. **価格付け子問題**: 制限主問題の LP 緩和から各顧客の双対変数（潜在価格）$\pi_i$ を取得し、最安挿入法と 2-opt 探索で被約費用 $\bar{c}_r = 1 - \sum_{i \in r} \pi_i < 0$ のルート $r$ を生成します。

## 入力データと制約条件

座標 $(0, 0)$ のデポと **50 件の顧客拠点**（各顧客の需要は **1〜4 単位**）を対象とします。

- **積載容量上限**: 1 台あたり **10 単位**。
- **訪問件数上限**: 1 ルートあたり **4 顧客**。
- **稼働時間上限**: 移動時間と荷降ろし時間の合計が **200 分**。
- **移動・作業時間**: 拠点間のユークリッド距離を整数に丸めた値（`Math.round`、1 単位 = 1 分）に加え、顧客 1 件あたり **10 分** の荷降ろし時間。

## WaSHI による実装

<CodeRunner>

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

interface RouteMeta {
  tour: string[];
  travelTime: number;
  totalTime: number;
}

interface CandidateCustomer {
  id: string;
  demand: number;
  dual: number;
}

interface RouteConstraints {
  dist: (a: string, b: string) => number;
  serviceTimes: Record<string, number>;
  vehicleCapacity: number;
  maxStops: number;
  maxRouteTime: number;
}

// --- 価格付け子問題用のルーティング探索ヘルパー ---

// 2-opt 局所探索（経路の交差を解消して走行距離を短縮）
function optimize2Opt(tour: string[], dist: (a: string, b: string) => number): string[] {
  let best = [...tour];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const dCurrent = dist(best[i - 1], best[i]) + dist(best[j], best[j + 1]);
        const dSwap = dist(best[i - 1], best[j]) + dist(best[i], best[j + 1]);
        if (dSwap < dCurrent) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

// 最安挿入法（総距離の増加が最小となる位置に顧客を挿入）
function insertCheapest(tour: string[], id: string, dist: (a: string, b: string) => number): string[] {
  let bestPos = 1;
  let minCost = Infinity;

  for (let p = 1; p < tour.length; p++) {
    const cost = dist(tour[p - 1], id) + dist(id, tour[p]) - dist(tour[p - 1], tour[p]);
    if (cost < minCost) {
      minCost = cost;
      bestPos = p;
    }
  }
  return [...tour.slice(0, bestPos), id, ...tour.slice(bestPos)];
}

// ルートの移動時間および合計所要時間（移動＋荷降ろし作業）を算出
function calcRouteTime(
  tour: string[],
  dist: (a: string, b: string) => number,
  serviceTimes: Record<string, number>
) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

// 価格付け子問題：双対変数（潜在価格）に基づき、被約費用が負（1 - dualSum < 0）の改善ルートを探索
function findImprovingRoute(candidates: CandidateCustomer[], config: RouteConstraints): string[] | null {
  let bestRoute: string[] | null = null;
  let minReducedCost = -1e-4;

  for (const seed of candidates.slice(0, 15)) {
    let tour = ["Depot", seed.id, "Depot"];
    let load = seed.demand;
    let dualSum = seed.dual;

    for (const next of candidates) {
      if (tour.includes(next.id)) continue;
      if (load + next.demand > config.vehicleCapacity) continue;
      if (tour.length - 2 >= config.maxStops) continue;

      // 最安挿入＋2-opt 局所探索でルートを整形
      const candidateTour = optimize2Opt(insertCheapest(tour, next.id, config.dist), config.dist);
      const { totalTime } = calcRouteTime(candidateTour, config.dist, config.serviceTimes);

      if (totalTime <= config.maxRouteTime) {
        tour = candidateTour;
        load += next.demand;
        dualSum += next.dual;
      }
    }

    // 被約費用 = 車両コスト (1) - 獲得した双対変数（潜在価格）の和
    const reducedCost = 1 - dualSum;
    if (reducedCost < minReducedCost) {
      minReducedCost = reducedCost;
      bestRoute = tour;
    }
  }
  return bestRoute;
}

// --- 列生成法による 50 顧客 CVRP ---

async function runCVRP() {
  const vehicleCapacity = 10;
  const maxStops = 4;
  const maxRouteTime = 200; // 分

  // デポおよび 50 件の顧客データ
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = Array.from({ length: 50 }, (_, i) => {
    const angle = i * 2.4;
    const radius = 15 + (i % 5) * 8;
    return {
      id: `C${i + 1}`,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      demand: 1 + (i % 4),
      serviceTime: 10,
    };
  });

  const nodes = Object.fromEntries([depot, ...customers].map((n) => [n.id, n]));
  const dist = (a: string, b: string) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig: RouteConstraints = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. 制限主問題 (RMP) の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期自明列: 1 顧客ごとの往復便
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(expr`sum(${initialRoutes})`));

  // 顧客訪問制約（集合分割）: 全顧客をちょうど 1 台の車両が担当
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`初期状態: 50 台の 1 顧客ごとの往復便。`);
  console.log("双対変数（潜在価格）に基づくヒューリスティック価格付けで列生成による求解を実行...");

  // 2. 列生成法による最適化
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. 双対変数（潜在価格）が大きい顧客順にソート
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. 価格付け子問題ヒューリスティクスで改善ルート（被約費用 < 0）を探索
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // 改善ルートが見つからなければ終了

      // 3. 改善ルートを新変数（列）として制限主問題へ提案
      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary" as const,
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`編成車両数: ${Math.round(result.objectiveValue ?? 0)} 台 (列生成ヒューリスティクス解)`);
  console.log(`生成されたルート列数: ${result.columnsAdded}`);

  console.log("\n選定された車両フリートのルート例 (上位 5 便):");
  const activeRoutes: RouteMeta[] = [];
  for (const c of result.generatedColumns) {
    if (c.variable.value === 1 && c.proposal.meta) {
      activeRoutes.push(c.proposal.meta);
    }
  }
  for (let i = 0; i < customers.length; i++) {
    if (initialRoutes[i].value === 1) {
      const tour = ["Depot", customers[i].id, "Depot"];
      const { travelTime, totalTime } = calcRouteTime(tour, dist, serviceTimes);
      activeRoutes.push({ tour, travelTime, totalTime });
    }
  }
  for (const r of activeRoutes.slice(0, 5)) {
    console.log(`  ${r.tour.join(" -> ")} (移動: ${r.travelTime}分, 合計: ${r.totalTime}分)`);
  }
}

runCVRP();
```

</CodeRunner>

## 解の読み解きとポイント

`50` 台の 1 顧客往復便から開始し、ヒューリスティック価格付けによって `63` 本のルート列が追加され、LP 緩和値は約 `12.65` まで下がります。この列プールをルートノードで MIP として解く（Price-and-Branch）と、`11` 本の複数顧客ルートと `8` 本の 1 顧客ルートからなる計 `19` 台のフリートが得られます。

### 制限主問題・価格付け子問題とルート情報（`meta`）の保持

制限主問題では LP 緩和と最終的な集合分割 MIP を解きます。`pricing` コールバックでは `visitConstrs[i].dual` から双対変数（潜在価格）を読み取り、その値が大きい顧客を優先してルートを組みます。`meta` に `{ tour, travelTime, totalTime }` を保存しておけば、求解後に `result.generatedColumns` から訪問順と所要時間を確認できます。

### 集合分割（`== 1`）と集合被覆（`>= 1`）の違い

本例では重複訪問を防ぐため `== 1` の集合分割制約を使っています。大規模な列生成では `>= 1` の集合被覆制約を使うと双対変数が $\pi_i \ge 0$ に保たれ、LP 収束が安定します。距離が三角不等式を満たせば、重複訪問を後処理で除いても移動時間・積載量・訪問件数・車両数は増えません。ただし本例のように `Math.round` で整数丸めする場合は、丸め誤差による三角不等式のわずかな違反に注意が必要です。

### ヒューリスティック価格付けと厳密解法（ESPPRC）

`findImprovingRoute` は資源制約付き初等最短路問題（ESPPRC）の厳密解法ではなく、貪欲な最安挿入法と 2-opt 探索を使っています。そのため、`null` を返した時点の LP 値は厳密な LP 下界ではなく、ヒューリスティック探索としての収束値です。

### Price-and-Branch（`finalizeAsMIP: true`）

分枝限定木の根ノード（ルートノード）で生成した列プールに対して最後に 1 回だけ MIP を解く手法は **Restricted Master Heuristic**（Price-and-Branch）と呼ばれます。フルの Branch-and-Price を実装せずに、実用的な整数解を短時間で得られます。
