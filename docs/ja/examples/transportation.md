# 輸送・物流ネットワーク問題 (LP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `m.continuous()`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=transportation">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">ソースコード</a></li></ul> |

**輸送問題**では、各工場から各店舗へ何個出荷するかを決定します。各工場の供給上限と各店舗の需要量を満たしながら、総輸送コストを最小化します。

この例では、`m.continuous(factories, stores)` で 2 次元の決定変数行列を作成し、`dot()`・`sum()`・``m.constraint(expr`...`)`` で集計制約を記述します。

## 入力データ

`Tokyo`・`Nagoya`・`Osaka` の 3 工場から、`North`・`East`・`West`・`South` の 4 店舗へ配送します。

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
import { Model, minimize, expr } from "@ohtaman/washi";

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
  m.objective(minimize(expr`dot(${shippingCost}, ${ship})`));

  // 3. 供給上限（行方向の合計）: 各工場からの総出荷量 <= cap[f]
  const supplyConstrs = Object.fromEntries(
    factories.map((f) => [
      f,
      m.constraint(expr`sum(${ship[f]}) <= ${cap[f]}`, `supply_${f}`),
    ])
  );

  // 4. 需要充足（列方向の合計）: 各店舗への総入荷量 >= demands[s]
  const demandConstrs = Object.fromEntries(
    stores.map((s) => [
      s,
      m.constraint(
        expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demands[s]}`,
        `demand_${s}`
      ),
    ])
  );

  const status = await m.solve();
  console.log(`[${label}] Status: ${status}, Total Shipping Cost: $${m.objectiveValue}`);
  for (const f of factories) {
    const dual = supplyConstrs[f].dual ?? 0;
    const routes = stores
      .map((s) => `${s}:${Math.round(ship[f][s].value ?? 0)}`)
      .join(", ");
    console.log(`  ${f.padEnd(7)} -> ${routes} (supply dual: $${dual}/u)`);
  }
  const demandDuals = stores
    .map((s) => `${s}:$${demandConstrs[s].dual ?? 0}`)
    .join(", ");
  console.log(`  Marginal Delivered Cost (demand duals) -> ${demandDuals}`);
}

async function runTransportation() {
  // シナリオ A: 通常時の供給能力 (最適解: $880)
  await solveScenario("Scenario A: Baseline", supplies);

  // シナリオ B: Tokyo を 120 -> 80 に縮小し、Nagoya (100 -> 120) と Osaka (80 -> 100) を増強 (最適解: $940)
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

### 供給・需要制約の潜在価格（`.dual`）

最小化 LP では、各制約の**潜在価格**（`.dual`）が右辺を 1 個増やしたときの総コスト変化量を表します。

- **`demand_s.dual`（$\ge 0$）:** 店舗 $s$ の需要を 1 個増やしたときの限界配送コストです。
- **`supply_f.dual`（$\le 0$）:** 工場 $f$ の供給上限を 1 個増強したときの総輸送費の減少額です。

最適輸送コストはシナリオ A で `$880`、シナリオ B で `$940` です。どちらのシナリオでも `Tokyo` は上限に張り付いており、`supply_Tokyo.dual` は `-$2/u` です。`Tokyo` の能力を 1 個増やすごとに Nagoya 経由の迂回を減らして `$2` 節約でき、`Osaka` も同様に `-$1/u` で上限に張り付いています。

### 供給不足への対処

ハードな需要制約を満たすには、総供給量が総需要量以上（$\sum \text{Supply}_f \ge \sum \text{Demand}_s$）である必要があります。総需要が全工場の供給上限を上回ると、HiGHS は `"Infeasible"` を返します。

供給不足にも対応するには、各店舗の需要制約 $\sum_f x_{f,s} + u_s \ge \text{Demand}_s$ に非負の欠品・スポット便変数 $u_s \ge 0$ を加えます。$u_s$ に高いペナルティ単価を設定すれば、限られた在庫を最適に配分できます。
