# 輸送・物流ネットワーク問題 (LP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=transportation">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">ソースコード</a></li></ul> |

複数の工場（供給拠点）から複数の店舗（需要拠点）へ商品を配送する際、各工場の供給能力上限と各店舗の需要量を満たしながら、総輸送コストを最小化する定番の線形計画問題です。

このサンプルでは、`m.continuous(factories, stores)` を使って **`ship[factory][store]` のような2次元インデックス変数**を1行で構築し、`dot()` による2次元コスト行列の内積や、`m.constraint(expr`...`)` での集計制約の書き方を学びます。

## 入力データ

3つの工場（`Tokyo`, `Nagoya`, `Osaka`）から4つの店舗（`North`, `East`, `West`, `South`）へ配送します。

| 工場 \ 店舗 | North ($/個) | East ($/個) | West ($/個) | South ($/個) | 工場の供給上限 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** 個 |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** 個 |
| **Osaka** | $9 | $7 | $2 | $3 | **80** 個 |
| **店舗の需要量** | **70** 個 | **90** 個 | **60** 個 | **60** 個 | 合計: 280 / 300 |

## 数理モデルの定式化

工場 $f \in F$ から店舗 $s \in S$ への輸送量を $x_{f, s} \ge 0$、単位輸送コストを $c_{f, s}$ とします。

$$\begin{aligned}
\text{Minimize} \quad & \sum_{f \in F} \sum_{s \in S} c_{f,s} \, x_{f,s} \\
\text{Subject to} \quad & \sum_{s \in S} x_{f,s} \le \text{Supply}_f \quad \forall f \in F \quad (\text{工場の供給能力上限}) \\
& \sum_{f \in F} x_{f,s} \ge \text{Demand}_s \quad \forall s \in S \quad (\text{店舗の需要充足}) \\
& x_{f,s} \ge 0 \quad \forall f \in F, s \in S
\end{aligned}$$

## WaSHI による実装

<CodeRunner preset="transportation">

```typescript
import { Model, sum, dot, minimize, expr } from "@ohtaman/washi";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

const shippingCost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };
const demands = { North: 70, East: 90, West: 60, South: 60 };

async function solveScenario(label: string, cap: typeof supplies) {
  const m = new Model("TransportationNetwork");

  // 1. 2次元決定変数の生成: ship[factory][store] >= 0
  const ship = m.continuous([...factories], [...stores], { lb: 0 });

  // 2. 目的関数: 2次元内積による総輸送コストの最小化
  m.objective(minimize(dot(shippingCost, ship)));

  // 3. 供給上限（行方向の合計）: 各工場からの総出荷量 <= cap[f]
  for (const f of factories) {
    m.constraint(
      expr`${sum(stores, (s) => ship[f][s])} <= ${cap[f]}`,
      `supply_${f}`
    );
  }

  // 4. 需要充足（列方向の合計）: 各店舗への総入荷量 >= demands[s]
  for (const s of stores) {
    m.constraint(
      expr`${sum(factories, (f) => ship[f][s])} >= ${demands[s]}`,
      `demand_${s}`
    );
  }

  const status = await m.solve();
  console.log(`[${label}] Status: ${status}, Total Shipping Cost: $${m.objectiveValue}`);
  for (const f of factories) {
    const dual = m.getConstraintByName(`supply_${f}`)?.dual ?? 0;
    const routes = stores
      .map((s) => `${s}:${Math.round(ship[f][s].value ?? 0)}`)
      .join(", ");
    console.log(`  ${f.padEnd(7)} -> ${routes} (supply dual: $${dual}/u)`);
  }
  const demandDuals = stores
    .map((s) => `${s}:$${m.getConstraintByName(`demand_${s}`)?.dual ?? 0}`)
    .join(", ");
  console.log(`  Marginal Delivered Cost (demand duals) -> ${demandDuals}`);
}

async function runTransportation() {
  // シナリオ A: 通常時の供給能力 ($920)
  await solveScenario("Scenario A: Baseline", supplies);

  // シナリオ B: メンテナンスにより Tokyo の供給上限が 120 -> 80 に減少 ($1,000)
  await solveScenario("Scenario B: Tokyo Maintenance", {
    Tokyo: 80,
    Nagoya: 120,
    Osaka: 100,
  });
}

runTransportation();
```

</CodeRunner>

## 実務上のポイント

- **供給・需要制約の潜在価格（`.dual`）の経済的意味**:
  - **`demand_s.dual`（$\ge 0$）**: 店舗 $s$ の需要が 1 個増えたときに発生する限界配送コスト（着地単価）を表します。
  - **`supply_f.dual`（$\le 0$）**: 工場 $f$ の供給能力を 1 個増強したときにネットワーク全体の輸送費がいくら下がるかを表します。シナリオ B で Tokyo が上限 80 個に制限されると `supply_Tokyo.dual` が `-$2/u` となり、Tokyo の能力を 1 個増やすごとに Nagoya からの迂回輸送が解消されて \$2 節約できることが分かります。
- **総供給量と総需要量のバランス（$\sum \text{Supply}_f \ge \sum \text{Demand}_s$）**: 需要の合計が全工場の供給能力合計を上回ると、ハード制約のままでは `"Infeasible"` になります。実務の物流計画システムでは、各店舗の需要制約に非負の欠品・スポット便スラック変数 $u_s \ge 0$（$\sum_f x_{f,s} + u_s \ge \text{Demand}_s$）を導入して高いペナルティ単価を設定することで、供給不足時でも優先度の高い店舗へ最適配分できるように設計します。
