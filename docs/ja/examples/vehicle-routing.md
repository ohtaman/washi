# 車両配送計画問題 (列生成法によるCVRP)

| 問題分類 | ソルバー | 主要 API | 関連リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題 (Capacitated Vehicle Routing Problem, CVRP)** は、物流・サプライチェーン最適化における代表的な組合せ最適化問題です。トラックの積載容量、1便あたりの最大訪問拠点数、およびルート制限時間（稼働時間上限）を満たしながら、全顧客を訪問するための最少車両数を求めます。

素朴な一括 MIP モデルでは、顧客の全訪問組み合わせ（ルート候補）をあらかじめ列挙すると変数数が指数関数的に爆発（$O(2^n)$）し、小規模な拠点数でも分枝限定法が停止してしまいます。

**列生成法 (Dantzig-Wolfe 分解)** を用いることで、すべてのルート候補を事前に生成することなく解くことができます：
1. **主問題 (Restricted Master Problem, RMP)**: すでに生成された配送ルートの中から、全顧客をカバーする最少の組み合わせを選択するセットカバリング（集合被覆）問題を解きます。
2. **価格付けサブ問題 (Pricing Subproblem)**: 主問題の顧客訪問制約から得られる **双対潜在価格 (shadow prices / duals)** を受け取り、積載容量・最大拠点数・制限時間を同時に満たしながら、主問題の目的関数を最も改善する（負の被約費用を持つ）効率的なトラック配送ルートを動的に生成します。

## 問題の入力と現場の運用制約

配送拠点（デポ）から出発する **5件の顧客** に対して、実務で典型的な **3つの運用制約** を設定します：
- **最大積載容量**: 1台あたり最大 **8 units** の荷物。
- **まわれる最大拠点数**: ドライバーの荷扱い負荷制限として、1便あたり最大 **3拠点** まで。
- **ルート制限時間 (最大稼働時間)**: 移動時間＋荷降ろし作業時間の合計を最大 **180分 (3時間)** 以内に制限。

| 顧客 | 配送需要 | 荷降ろし作業時間 | デポからの移動時間 | 合計所要時間 |
| :--- | :---: | :---: | :---: | :---: |
| **顧客 1 (C1)** | 4 units | 30分 | 20分 | 50分 |
| **顧客 2 (C2)** | 3 units | 25分 | 30分 | 55分 |
| **顧客 3 (C3)** | 5 units | 40分 | 15分 | 55分 |
| **顧客 4 (C4)** | 2 units | 20分 | 25分 | 45分 |
| **顧客 5 (C5)** | 4 units | 35分 | 20分 | 55分 |

- 顧客の総需要量: $4 + 3 + 5 + 2 + 4 = 18$ units。
- 理論上の最少車両数下限: $\lceil 18 / 8 \rceil = 3$ 台。

## WaSHI による実装

下の **▶ Run** をクリックすると、ブラウザ上で列生成法が対話的に実行されます。WaSHI の `sum()` ヘルパーと `expr` テンプレートにより、低レベルなループ式構築コードを一切使わず、すっきりと宣言的に記述できる点にご注目ください：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // 現場の運用制約パラメータ
  const vehicleCapacity = 8;  // 最大積載量 (units)
  const maxStops = 3;         // 1便あたりの最大訪問拠点数
  const maxRouteTime = 180;   // ルート最大稼働時間 (分)

  const customers = [
    { id: "C1", demand: 4, serviceTime: 30, transitTime: 20 },
    { id: "C2", demand: 3, serviceTime: 25, transitTime: 30 },
    { id: "C3", demand: 5, serviceTime: 40, transitTime: 15 },
    { id: "C4", demand: 2, serviceTime: 20, transitTime: 25 },
    { id: "C5", demand: 4, serviceTime: 35, transitTime: 20 },
  ];

  // 1. 主問題 (Restricted Master Problem, RMP) の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期の自明な単独ルート（各顧客に専用車1台を割り当てた状態）
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));

  // 目的関数: 総車両数を最小化
  master.objective(minimize(sum(initialRoutes)));

  // 顧客カバー制約: 各顧客はいずれかのルートで少なくとも1回訪問される
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }

  console.log("初期状態: 単独訪問ルート5本 (5台体制)。");
  console.log("列生成法 (Dantzig-Wolfe 分解) による最適化を開始...");

  // 2. 列生成法による反復求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // 価格付けサブ問題: 主問題の双対潜在価格から、
      // 積載量・拠点数・制限時間の3資源制約を同時に満たす最良の巡回ルートを動的探索
      const sub = new Model("RoutePricing");

      const visitVars = Object.fromEntries(
        customers.map((c) => [c.id, sub.binary(`v_${c.id}`)])
      );

      // 双対潜在価格（主問題の制約緩和による改善余地）の合計収益を最大化
      sub.objective(
        maximize(sum(customers, (c) => visitVars[c.id].mul(getDual(`visit_${c.id}`))))
      );

      // 資源制約①: 車両の積載容量上限
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 資源制約②: 1便あたりの最大訪問拠点数
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id])} <= ${maxStops}`
      );

      // 資源制約③: ルート制限時間 (移動時間 ＋ 荷降ろし作業時間の合計上限)
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.transitTime + c.serviceTime))} <= ${maxRouteTime}`
      );

      await sub.solve();

      const coefficients = {};
      const visited = [];
      for (const c of customers) {
        if (Math.round(visitVars[c.id].value ?? 0) === 1) {
          coefficients[`visit_${c.id}`] = 1;
          visited.push(c.id);
        }
      }

      return {
        cost: 1, // 1ルートあたり車両1台
        type: "Binary",
        coefficients,
        meta: { visitedCustomers: visited },
      };
    },
    onIteration: (info) => {
      console.log(
        `反復 ${info.iteration}: LP連続緩和の目的関数値 = ${info.relaxationObjective?.toFixed(2)}, 追加されたルート列数 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`最適車両数: ${result.objectiveValue} 台`);
  console.log(`動的生成されたルート列の総数: ${result.columnsAdded}`);

  console.log("\n最適配送計画として採用されたルート:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (訪問先: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 実装のポイント

1. **`sum()` と `expr` による自然な複数資源制約の記述**: WaSHI の `sum(...)` ヘルパーにより、手続き的な累加ループなしで「積載量」「最大拠点数」「制限時間」という現場の多次元リソース制約を宣言的かつクリーンに表現できます。
2. **`getDual` による明快な制約双対値の取得**: 線形計画の双対理論において、潜在価格（shadow price）は変数ではなく **制約（Constraint）** に紐付きます。`getDual("visit_C1")` を通じて主問題の連続緩和解から安全かつ自然に潜在価格を取得できます。
3. **メタデータの分離**: `meta: { visitedCustomers: visited }` を用いることで、訪問先の顧客リストなどのドメイン情報を列に付与し、生成変数名をパースすることなく `result.generatedColumns` から直接取り出せます。
