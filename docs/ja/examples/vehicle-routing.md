# 車両配送計画問題 (50顧客の列生成法によるCVRP)

| 問題分類 | ソルバー | 主要 API | 関連リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題 (Capacitated Vehicle Routing Problem, CVRP)** は、物流・サプライチェーン最適化における代表的な組合せ最適化問題です。トラックの積載容量、1便あたりの最大訪問拠点数、およびルート制限時間（稼働時間上限）を満たしながら、全顧客を過不足なく訪問するための最少車両数と最適な配送ルートを求めます。

素朴な一括 MIP モデルでは、顧客の全訪問順序やルート候補をあらかじめ列挙すると変数数が指数関数的に爆発（$O(2^n)$）し、小規模な拠点数でも分枝限定法が停止してしまいます。

**列生成法 (Dantzig-Wolfe 分解)** を用いることで、すべてのルート候補を事前に生成することなく解くことができます：
1. **主問題 (Restricted Master Problem, RMP)**: すでに生成された配送ルートの中から、全顧客をちょうど1回ずつ訪問する最少の組み合わせを選択するセットパーティショニング（集合分割）問題を解きます。
2. **価格付けサブ問題 (Pricing Subproblem / ヒューリスティクス)**: 実務や学術研究（Branch-and-Price）において、サブ問題を汎用 MIP で解くのは非常に非効率です。代わりに、主問題の制約から得られる **双対潜在価格 (shadow prices / duals)** を道しるべとして、**高速なドメインヒューリスティクス（最短挿入法 ＋ 2-opt 局所探索）** により改善ルート（被約費用が負となる列）を動的生成します。

## 問題の入力と現場の運用制約

$(0, 0)$ の配送拠点（デポ）と、周辺エリアに分散する **50件の顧客配送先** を対象とします：

- **運用制約**:
  - **最大積載容量**: 1台あたり最大 **10 units** の荷物。
  - **まわれる最大拠点数**: ドライバーの作業負荷制限として、1便あたり最大 **4拠点** まで。
  - **ルート制限時間 (最大稼働時間)**: 走行時間＋荷降ろし作業時間の合計を最大 **200分** 以内に制限。
- **拠点間移動時間**: 各拠点間のユークリッド距離行列から計算（平均走行速度 $1\text{ km/分} = 60\text{ km/h}$ と仮定）。
- **荷降ろし作業時間**: 1顧客あたり 10分。

## WaSHI による実装

下の **▶ Run** ボタンをクリックすると、ブラウザ上で対話的に 50 顧客の CVRP を解くことができます。ルート探索ヒューリスティクス（`findImprovingRoute` / `optimize2Opt`）が外出しされているため、主問題と列生成ループが驚くほどスッキリしており、WebAssembly 上でもわずか約 0.5 秒で完了します：

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
  const activeRoutes = result.generatedColumns.filter((c) => (c.variable.value ?? 0) > 0.5);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (移動: ${meta?.travelTime}分, 合計: ${meta?.totalTime}分)`);
  }
}

runCVRP();
```

</CodeRunner>

## ポイント

1. **ハイブリッド最適化（数理最適化 × ドメインヒューリスティクス）**: 実務の Branch-and-Price では、価格付けサブ問題を重い MIP で解く必要はありません。主問題（LP緩和と集合分割MIP）の数理厳密性と、副問題（最短挿入＋2-opt）の超高速ドメイン探索を組み合わせることで、極めて高いスケーラビリティを実現できます。
2. **50 拠点がブラウザ上で約 0.5 秒で完了**: 重いサブ問題 MIP を排除することで、探索木の爆発や Emscripten のメモリ制限を完全に回避し、ブラウザ上でも大規模な配送計画問題を瞬時に解くことができます。
3. **外出しヘルパーによる高い可読性**: 巡回改善（`optimize2Opt`）、最短挿入（`insertCheapest`）、所要時間計算（`calcRouteTime`）を関数として独立させることで、ビジネスロジックと数理モデルの役割分担が明確になります。
4. **制約の双対価格に `.dual` で直接アクセス**: 主問題の LP 緩和解から得られる潜在価格を `visitConstrs[i].dual` で直接参照し、改善効果の高い顧客の組み合わせを誘導します。
