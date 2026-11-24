# 車両配送計画問題 (列生成法によるCVRP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` (`sum`) | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="/ja/guide/decomposition">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題（CVRP）** は、全顧客を訪問するために必要な最小車両数と配送ルートを求める問題です。各ルートは積載容量、1 便の最大訪問件数、稼働時間上限を満たす必要があります。

全ルート候補を事前に列挙する定式化では、0-1 変数が $O(2^n)$ で増大します。**列生成法（Dantzig-Wolfe 分解）** を使うと、必要なルートだけを反復的に追加できます。
1. **制限主問題（RMP）**: 生成済みルート候補から、各顧客をちょうど 1 回訪問する集合分割問題を解きます。
2. **価格付け子問題**: 制限主問題の LP 緩和から双対変数（潜在価格）を取得し、最短挿入法と 2-opt 探索で被約費用 $\bar{c} = 1 - \sum \pi_i < 0$ のルートを生成します。

## 入力データと制約条件

座標 $(0, 0)$ のデポと **50 件の顧客拠点** を対象とします。

- **最大積載容量**: 1 台あたり最大 **10 units**。
- **最大訪問件数**: 1 ルートあたり最大 **4 顧客**。
- **最大稼働時間**: 移動時間と荷降ろし時間の合計が最大 **200 分**。
- **移動・作業時間**: 拠点間のユークリッド距離（1 単位 = 1 分）に加え、顧客 1 件あたり **10 分** の荷降ろし時間。

## WaSHI による実装

<CodeRunner>

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// --- 外出しルーティング探索ヘルパー（価格付け子問題） ---

// 2-opt局所探索（交差アークを解消して走行距離を短縮）
function optimize2Opt(tour, dist) {
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

// 最短挿入法（迂回距離の増加が最小となる位置に顧客を挿入）
function insertCheapest(tour, id, dist) {
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
function calcRouteTime(tour, dist, serviceTimes) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

// 価格付け子問題：双対変数（潜在価格）に基づき、被約費用が負（1 - dualSum < 0）の改善ルートを探索
function findImprovingRoute(candidates, config) {
  let bestRoute = null;
  let minReducedCost = -1e-4;

  for (const seed of candidates.slice(0, 15)) {
    let tour = ["Depot", seed.id, "Depot"];
    let load = seed.demand;
    let dualSum = seed.dual;

    for (const next of candidates) {
      if (tour.includes(next.id)) continue;
      if (load + next.demand > config.vehicleCapacity) continue;
      if (tour.length - 2 >= config.maxStops) continue;

      // 最短挿入＋2-opt局所探索でルートを整形
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

// --- 列生成法による 50顧客 CVRP ---

async function runCVRP() {
  const vehicleCapacity = 10;
  const maxStops = 4;
  const maxRouteTime = 200; // 分

  // デポおよび 50件の顧客データ
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
  const dist = (a, b) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. 制限主問題 (RMP) の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期自明列: 顧客1件ごとの専用ピストン便
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(expr`sum(${initialRoutes})`));

  // 顧客被覆制約: 全顧客をちょうど1台の車両が担当
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`初期状態: 50台の単独ピストン便。`);
  console.log("双対変数（潜在価格）に基づくヒューリスティック価格付けで列生成法を実行...");

  // 2. 列生成法による最適化
  const result = await master.solveColumnGeneration({
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
      const coefficients = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary",
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`編成車両数: ${Math.round(result.objectiveValue ?? 0)}台 (列生成ヒューリスティクス解)`);
  console.log(`生成されたルート列数: ${result.columnsAdded}`);

  console.log("\n選定された車両フリートのルート例 (上位5便):");
  const activeRoutes = result.generatedColumns.filter((c) => c.variable.value === 1);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (移動: ${meta?.travelTime}分, 合計: ${meta?.totalTime}分)`);
  }
}

runCVRP();
```

</CodeRunner>

## 解の読み解きとポイント

### 制限主問題・価格付け子問題・ルート情報

制限主問題では LP 緩和と最終的な集合分割 MIP を解きます。`pricing` コールバックでは `visitConstrs[i].dual` から双対変数（潜在価格）を読み取り、改善効果の大きい顧客を優先してルートを組みます。`meta` に `{ tour, travelTime, totalTime }` を保存しておけば、求解後に `result.generatedColumns` から訪問順と所要時間を確認できます。

### 集合分割（`== 1`）と集合被覆（`>= 1`）の違い

本例では重複訪問を防ぐため `== 1` の集合分割制約を使っています。大規模な列生成では `>= 1` の集合被覆制約を使うと双対変数が $\pi_i \ge 0$ に保たれ、LP 収束が安定します。距離が三角不等式を満たす場合は、重複訪問された顧客を後処理で取り除いても総距離は増えません。

### ヒューリスティック価格付けと厳密 ESPPRC

`findImprovingRoute` は厳密な資源制約付き初等最短路問題（ESPPRC）ではなく、貪欲な最短挿入法と 2-opt 探索を使っています。そのため、`null` を返した時点の LP 値は厳密な双対下界ではなく、ヒューリスティック探索としての収束値です。

### Price-and-Branch（`finalizeAsMIP: true`）

ルートノードで生成した列プールに対して最後に 1 回だけ MIP を解く手法は **Restricted Master Heuristic**（Price-and-Branch）と呼ばれます。フルの Branch-and-Price を実装せずに、実用的な整数解を短時間で得られます。
