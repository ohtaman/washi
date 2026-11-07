# 車両配送計画問題 (CVRP: 列生成法)

| 問題クラス | ソルバー | 主要 API | 関連リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Dantzig-Wolfe | HiGHS (標準) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**容量制約付き車両配送計画問題（CVRP: Capacitated Vehicle Routing Problem）** は、物流やサプライチェーン最適化における最も代表的な難関問題です。各顧客への配送需要とトラックの積載容量制限を満たしながら、すべての顧客を訪問するために必要な最少車両数（または最少総運行コスト）を求めます。

素朴な一体型 MIP で「トラックが訪問しうる全顧客の組み合わせ」を変数として列挙しようとすると、変数の数が指数関数的（$O(2^n)$）に爆発し、中規模な顧客数でも分枝限定法が探索不能に陥ります。

**列生成法（Dantzig-Wolfe 分解）** を使うことで、すべてのルートを事前に列挙することなく解くことができます：
1. **制限主問題（RMP）**: 「顧客ごとに専用トラックを1台走らせる」といった少数の素朴な初期ルートからスタートし、全顧客をカバーする最少ルートの組み合わせを選びます。
2. **価格付け子問題（Pricing Subproblem）**: 主問題の顧客訪問制約から得られる **シャドウプライス（双対値）** をもとに、トラックの積載容量内で複数顧客を効率よくまとめられる有望な新規ルートを動的に探索・生成します。

## 問題の入力データ

配送需要を持つ **5 箇所の顧客** と、積載容量 **8 単位** の配送トラックを考えます：

| 顧客 | 配送需要量 | 車両の積載上限 |
| :--- | :---: | :---: |
| **顧客 1 (C1)** | 4 単位 | 8 単位 |
| **顧客 2 (C2)** | 3 単位 | 8 単位 |
| **顧客 3 (C3)** | 5 単位 | 8 単位 |
| **顧客 4 (C4)** | 2 単位 | 8 単位 |
| **顧客 5 (C5)** | 4 単位 | 8 単位 |

- 顧客の総需要量: $4 + 3 + 5 + 2 + 4 = 18$ 単位
- 理論上の必要最少台数（下限）: $\lceil 18 / 8 \rceil = 3$ 台

## WaSHI による実装

下の **▶ 実行（Run）** ボタンをクリックすると、ブラウザ内で実際にソルバーが起動し、反復計算によるルート生成と最適台数の決定を対話的に体験できます：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, LinExpr } from "@ohtaman/washi";

async function runCVRP() {
  const vehicleCapacity = 8;
  const customers = [
    { id: "C1", demand: 4 },
    { id: "C2", demand: 3 },
    { id: "C3", demand: 5 },
    { id: "C4", demand: 2 },
    { id: "C5", demand: 4 },
  ];

  // 1. 制限主問題（RMP）の構築
  const master = new Model("CVRP_FleetMaster");

  // 初期ルート: 各顧客ごとに1台の専用トラックを走らせる素朴な解
  const initialRoutes = [];
  for (const cust of customers) {
    const r = master.binary(`route_init_${cust.id}`);
    initialRoutes.push(r);
  }

  // 目的関数: 総車両数の最小化
  master.objective(
    minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr()))
  );

  // 顧客訪問制約: 各顧客は少なくとも1つのルートで訪問されること
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }

  console.log("初期状態: 顧客ごとに1台の専用ルート（計5台）");
  console.log("列生成法による反復求解を開始...");

  // 2. 列生成法で求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // 価格付け子問題: 主問題の双対値を受け取り、トラック容量内で最も価値の高い新規ルートを探索
      const sub = new Model("RoutePricing");

      const visitVars = {};
      const obj = new LinExpr();

      for (const cust of customers) {
        visitVars[cust.id] = sub.binary(`v_${cust.id}`);
        const dual = getDual(`visit_${cust.id}`);
        obj.addTerm(visitVars[cust.id], dual);
      }

      // 訪問による双対価値の最大化
      sub.objective(maximize(obj));

      // ナップサック積載制約: sum(demand_i * v_i) <= vehicleCapacity
      const loadExpr = customers.reduce(
        (acc, cust) => acc.add(visitVars[cust.id].mul(cust.demand)),
        new LinExpr()
      );
      sub.constraint(expr`${loadExpr} <= ${vehicleCapacity}`);

      await sub.solve();

      const coefficients = {};
      const visited = [];
      for (const cust of customers) {
        if (Math.round(visitVars[cust.id].value ?? 0) === 1) {
          coefficients[`visit_${cust.id}`] = 1;
          visited.push(cust.id);
        }
      }

      return {
        cost: 1, // 1ルートにつきトラック1台
        type: "Binary",
        coefficients,
        meta: { visitedCustomers: visited },
      };
    },
    onIteration: (info) => {
      console.log(
        `Iter ${info.iteration}: LP緩和目的値 = ${info.relaxationObjective?.toFixed(2)}, 追加列数 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`最適車両数: ${result.objectiveValue} 台`);
  console.log(`生成されたルート総数: ${result.columnsAdded}`);

  console.log("\n最適フリートで採用されたルート:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (訪問顧客: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 実装のポイント

1. **自然なモデル定義**: 主問題の定義にダミー制約や特別な列構文は不要です。標準の `master.binary()` と `master.constraint()` を使って通常通りに初期モデルを定義できます。
2. **透明な `pricing` コールバック**: 子問題では `getDual("visit_C1")` で双対値を取得し、ナップサック問題を解いて `{ coefficients: { visit_C1: 1, ... } }` を返すだけで連携が完結します。
3. **`meta` による解データの復元**: `meta: { visitedCustomers: visited }` に業務オブジェクトを持たせることで、生成された変数名（`x_4` 等）に依存せず、解いた後に訪問ルートの詳細を型安全に取り出せます。
