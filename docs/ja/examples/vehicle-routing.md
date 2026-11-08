# 車両配送計画問題 (列生成法によるCVRP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題 (Capacitated Vehicle Routing Problem, CVRP)** は、車両の積載容量、1便あたりの最大訪問件数、および稼働時間の上限を満たしながら、すべての顧客を訪問するのに必要な車両数と配送ルートを求める問題です。

すべてのルート候補を事前に列挙する定式化では、顧客数の増加に伴って変数の組合せが $O(2^n)$ で増加します。**列生成法 (Dantzig-Wolfe 分解)** では、必要なルート候補を反復的に追加して解きます：
1. **制限主問題 (Restricted Master Problem, RMP)**: 生成済みのルート候補から、各顧客をちょうど1回ずつ訪問する組み合わせを選ぶ集合分割問題を解きます。
2. **価格付け子問題 (Pricing Subproblem)**: 主問題の LP 緩和から得られる双対変数（潜在価格 `dual`）を参照し、最短挿入法と 2-opt 局所探索によって被約費用が負（$\bar{c} = 1 - \sum \pi_i < 0$）となるルートを生成します。

## 入力データと制約条件

座標 $(0, 0)$ のデポと **50件の顧客拠点** を対象とします：

- **最大積載容量**: 1台あたり最大 **10 units**。
- **最大訪問件数**: 1ルートあたり最大 **4顧客**。
- **最大稼働時間**: 移動時間と荷降ろし時間の合計が最大 **200分**。
- **移動・作業時間**: 拠点間のユークリッド距離（1単位＝1分）＋ 顧客1件あたり **10分** の荷降ろし時間。

## WaSHI による実装

<CodeRunner>

```typescript
import { Model, expr, minimize, sum } from "@ohtaman/washi";

// --- 外出しルーティング探索ヘルパー（副問題） ---

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

// 価格付け副問題：双対潜在価格に基づき、被約費用が負（1 - dualSum < 0）となる最良改善ルートを探索
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

    // 被約費用 = 車両コスト (1) - 獲得した双対潜在価格
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

  // 1. 限定主問題 (RMP) の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期自明列: 顧客1件ごとの専用ピストン便
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // 顧客被覆制約: 全顧客をちょうど1台の車両が担当
  for (let i = 0; i < customers.length; i++) {
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${customers[i].id}`);
  }
  const visitConstrs = master.constraints;

  console.log(`初期状態: 50台の単独ピストン便。`);
  console.log("双対潜在価格に基づくヒューリスティック価格付けで列生成法を実行...");

  // 2. 列生成法による最適化
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. 双対潜在価格（被覆の改善利益）が大きい顧客順にソート
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. 副問題ヒューリスティクスで改善ルート（被約費用 < 0）を探索
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // 改善ルートが見つからなければ LP 緩和最適で終了

      // 3. 改善ルートを新変数（列）として主問題へ提案
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

## 補足

- **主問題と価格付け処理の分離**: 主問題では LP 緩和と集合分割 MIP を解き、`pricing` コールバックでは最短挿入法と 2-opt 局所探索で負の被約費用を持つルート候補を生成しています。
- **双対変数の参照**: 主問題の LP 緩和で得られた潜在価格を `visitConstrs[i].dual` から取得し、改善量の大きい顧客を優先してルートを組み立てています。
- **ルート情報の保持**: 各列の `meta` に `{ tour, travelTime, totalTime }` を保持することで、求解後に `result.generatedColumns` から訪問順序や所要時間を参照できます。
- **集合分割 (`== 1`) と集合被覆 (`>= 1`) の違い**: 本例では同一顧客への重複訪問を禁止するため `== 1`（集合分割）を用いています。大規模な列生成実務では `>= 1`（集合被覆）とすることで双対変数の符号が $\pi_i \ge 0$ に制限されて LP 収束が安定しやすくなります（距離が三角不等式を満たす場合、重複訪問された顧客は後処理で抜くことでコストを増やさず集合分割解へ変換できます）。
- **ヒューリスティック価格付けと厳密 ESPPRC**: `findImprovingRoute` は厳密な資源制約付き初等最短路問題（ESPPRC）ではなく高速な貪欲法＋2-opt を用いるため、`null` を返した時点の LP 目的関数値は厳密な双対下界ではなくヒューリスティック収束値となります。
- **Price-and-Branch (`finalizeAsMIP: true`)**: ルートノードの LP 緩和で生成された列プールに対して最後に一度だけ整数計画（MIP）を解く手法は Restricted Master Heuristic（Price-and-Branch）と呼ばれ、フル Branch-and-Price 実装なしで高品質な整数解を高速に得る実務定番アプローチです。
