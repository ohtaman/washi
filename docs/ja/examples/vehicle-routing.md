# 車両配送計画問題 (列生成法によるCVRP)

| 問題分類 | ソルバー | 主要 API | 関連リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題 (Capacitated Vehicle Routing Problem, CVRP)** は、物流・サプライチェーン最適化における代表的な組合せ最適化問題です。トラックの積載容量、1便あたりの最大訪問拠点数、およびルート制限時間（稼働時間上限）を満たしながら、全顧客を過不足なく訪問するための最少車両数と最適な配送ルートを求めます。

素朴な一括 MIP モデルでは、顧客の全訪問順序やルート候補をあらかじめ列挙すると変数数が指数関数的に爆発（$O(2^n)$）し、小規模な拠点数でも分枝限定法が停止してしまいます。

**列生成法 (Dantzig-Wolfe 分解)** を用いることで、すべてのルート候補を事前に生成することなく解くことができます：
1. **主問題 (Restricted Master Problem, RMP)**: すでに生成された配送ルートの中から、全顧客をちょうど1回ずつ訪問する最少の組み合わせを選択するセットパーティショニング（集合分割）問題を解きます。
2. **価格付けサブ問題 (Pricing Subproblem)**: 主問題の顧客訪問制約から得られる **双対潜在価格 (shadow prices / duals)** を受け取り、拠点間距離行列に基づくネットワークフローと部分巡回路排除（MTZ制約）により、積載容量・最大拠点数・制限時間を満たす効率的な巡回路（トラック配送ルート）を動的に生成します。

## 問題の入力と現場の運用制約

$(0, 0)$ の配送拠点（デポ）から出発する **5件の顧客** に対して、2次元座標 (km)、配送需要、荷降ろし作業時間 (分) を設定します：

| 拠点 | 座標 $(x, y)$ | 配送需要 | 荷降ろし作業時間 |
| :--- | :---: | :---: | :---: |
| **配送拠点 (Depot)** | $(0, 0)$ | — | — |
| **顧客 1 (C1)** | $(20, 20)$ | 4 units | 30分 |
| **顧客 2 (C2)** | $(25, -10)$ | 3 units | 25分 |
| **顧客 3 (C3)** | $(-20, 30)$ | 5 units | 40分 |
| **顧客 4 (C4)** | $(-15, -25)$ | 2 units | 20分 |
| **顧客 5 (C5)** | $(30, 15)$ | 4 units | 35分 |

- **運用制約**:
  - **最大積載容量**: 1台あたり最大 **8 units** の荷物。
  - **まわれる最大拠点数**: ドライバーの荷扱い負荷制限として、1便あたり最大 **3拠点** まで。
  - **ルート制限時間 (最大稼働時間)**: アーク移動時間＋荷降ろし作業時間の合計を最大 **180分 (3時間)** 以内に制限。
- **拠点間移動時間**: 各拠点間のユークリッド距離行列から計算（平均走行速度 $1\text{ km/分} = 60\text{ km/h}$ と仮定）。
- 合計配送需要: $4 + 3 + 5 + 2 + 4 = 18$ units。
- 理論上の最小必要車両数: $\lceil 18 / 8 \rceil = 3$ 台。

## WaSHI による実装

下の **▶ Run** ボタンをクリックすると、ブラウザ上で対話的に CVRP を解くことができます。価格付けサブ問題がネットワークフロー保存制約と MTZ 部分巡回路排除制約を解き、実際の走行順序に沿った正確な所要時間を評価します：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // 運用制約
  const vehicleCapacity = 8;
  const maxStops = 3;
  const maxRouteTime = 180; // 分

  // デポおよび顧客の2次元座標 (km)
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = [
    { id: "C1", x: 20, y: 20, demand: 4, serviceTime: 30 },
    { id: "C2", x: 25, y: -10, demand: 3, serviceTime: 25 },
    { id: "C3", x: -20, y: 30, demand: 5, serviceTime: 40 },
    { id: "C4", x: -15, y: -25, demand: 2, serviceTime: 20 },
    { id: "C5", x: 30, y: 15, demand: 4, serviceTime: 35 },
  ];

  const nodes = [depot, ...customers];
  const n = nodes.length;

  // 拠点間移動時間行列 (1 km = 1分)
  const dist = nodes.map((a) =>
    nodes.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y)))
  );

  // 1. 主問題 (RMP) の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期ルート: 各顧客ごとに1台専従（デポ -> 顧客 -> デポ）
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // 顧客訪問制約: 各顧客をちょうど1台の車両が訪問
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} == 1`,
      `visit_${customers[i].id}`
    );
  }
  const visitConstrs = master.constraints;

  console.log("初期状態: 5台の単独顧客便 (5台)。");
  console.log("列生成法で反復最適化中...");

  // 2. 列生成法による求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 価格付けサブ問題: 被約費用が負になる改善ルートを探索
      // 被約費用 = 1 - sum(visit_i * dual_i) < 0 <=> 最大化 sum(visit_i * dual_i) > 1
      const sub = new Model("RoutePricing");

      const y = [];
      for (let i = 1; i < n; i++) y[i] = sub.binary(`y_${i}`);

      const x = [];
      for (let i = 0; i < n; i++) {
        x[i] = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) x[i][j] = sub.binary(`x_${i}_${j}`);
        }
      }

      // 主問題の双対潜在価格を目的関数として最大化
      sub.objective(
        maximize(sum(customers, (c, i) => y[i + 1].mul(visitConstrs[i].dual ?? 0)))
      );

      // 1. 積載容量制限
      sub.constraint(
        expr`${sum(customers, (c, i) => y[i + 1].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 2. 最大訪問拠点数制限
      sub.constraint(expr`${sum(customers, (c, i) => y[i + 1])} <= ${maxStops}`);

      // 3. デポの出入りフロー保存制約
      const leaveDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[0][k + 1]));
      const enterDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[k + 1][0]));
      sub.constraint(expr`${leaveDepot} <= 1`);
      sub.constraint(expr`${enterDepot} == ${leaveDepot}`);

      // 顧客ノードのフロー保存制約 (流入 == 流出 == y_i)
      for (let i = 1; i < n; i++) {
        const inFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[j][i] : undefined)).filter(Boolean)
        );
        const outFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[i][j] : undefined)).filter(Boolean)
        );
        sub.constraint(expr`${inFlow} == ${y[i]}`);
        sub.constraint(expr`${outFlow} == ${y[i]}`);
      }

      // 4. MTZ 部分巡回路排除制約
      const u = [];
      for (let i = 1; i < n; i++) u[i] = sub.continuous(`u_${i}`, { lb: 1, ub: n - 1 });
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          if (i !== j) {
            sub.constraint(expr`${u[i]} - ${u[j]} + ${n} * ${x[i][j]} <= ${n - 1}`);
          }
        }
      }

      // 5. ルート所要時間制限 (移動時間 + 作業時間 <= 180分)
      const arcTimes = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) arcTimes.push(x[i][j].mul(dist[i][j]));
        }
      }
      const totalTravelTime = sum(arcTimes);
      const totalServiceTime = sum(customers, (c, i) => y[i + 1].mul(c.serviceTime));
      sub.constraint(expr`${totalTravelTime} + ${totalServiceTime} <= ${maxRouteTime}`);

      await sub.solve();

      const dualProfit = sub.solution?.objectiveValue ?? 0;
      if (dualProfit <= 1 + 1e-4) return null;

      const coefficients = {};
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          coefficients[`visit_${customers[i].id}`] = 1;
        }
      }

      // 実際の巡回順序を復元: Depot -> ... -> Depot
      const tour = ["Depot"];
      let curr = 0;
      let travelMins = 0;
      const visitedSet = new Set();
      while (true) {
        let next = -1;
        for (let j = 0; j < n; j++) {
          if (curr !== j && Math.round(x[curr][j].value ?? 0) === 1) {
            next = j;
            break;
          }
        }
        if (next === -1 || next === 0 || visitedSet.has(next)) {
          tour.push("Depot");
          if (next === 0) travelMins += dist[curr][0];
          break;
        }
        visitedSet.add(next);
        travelMins += dist[curr][next];
        tour.push(nodes[next].id);
        curr = next;
      }

      let serviceMins = 0;
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          serviceMins += customers[i].serviceTime;
        }
      }

      return {
        cost: 1, // 1便（車両1台）
        type: "Binary",
        coefficients,
        meta: {
          tour,
          travelTime: travelMins,
          totalTime: travelMins + serviceMins,
        },
      };
    },
    onIteration: (info) => {
      console.log(
        `Iter ${info.iteration}: LP緩和目的関数 = ${info.relaxationObjective?.toFixed(2)}, 追加列数 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`最適車両数: ${result.objectiveValue}`);
  console.log(`生成されたルート総数: ${result.columnsAdded}`);

  console.log("\n最適配送計画で採用されたルート:");
  for (let i = 0; i < customers.length; i++) {
    if ((initialRoutes[i].value ?? 0) > 0.5) {
      const transit = dist[0][i + 1] + dist[i + 1][0];
      const total = transit + customers[i].serviceTime;
      console.log(`  ルート: Depot -> ${customers[i].id} -> Depot (移動: ${transit}分, 合計: ${total}分) = ${initialRoutes[i].value}`);
    }
  }
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      const meta = col.proposal.meta;
      console.log(`  ルート: ${meta?.tour.join(" -> ")} (移動: ${meta?.travelTime}分, 合計: ${meta?.totalTime}分) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 実装のポイント

1. **ネットワークフローと MTZ 制約による本格的な巡回路生成**: 価格付けサブ問題でアーク変数 $x_{ij}$、フロー保存制約、MTZ 順序変数 $u_i$ を組み込み、拠点間距離行列に基づいて正確な巡回順序と移動時間を最適化します。
2. **`sum()` と `expr` による宣言的な多資源制約モデリング**: 積載容量、最大訪問拠点数、およびルート所要時間制限を、アキュムレータループなしで直感的に記述できます。
3. **制約オブジェクトからの直接的な双対変数アクセス (`.dual`)**: 主問題の各制約のシャドウプライスを `c.dual` で直接参照でき、余計な引数やラッパー関数が不要です。
4. **メタデータ連携によるルート復元 (`meta`)**: `meta: { tour, travelTime, totalTime }` により、最適解で選ばれた車両の実際の巡回順（`Depot -> C1 -> C5 -> Depot`）や移動時間を直接取り出すことができます。
