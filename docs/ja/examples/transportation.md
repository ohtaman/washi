# 輸送・物流ネットワーク問題 (LP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `m.continuous()`, `m.constrain()`, `expr`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=transportation">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">ソースコード</a></li></ul> |

複数の工場（供給拠点）から複数の店舗（需要拠点）へ商品を配送する際、各工場の供給能力上限と各店舗の需要量を満たしながら、総輸送コストを最小化する定番の線形計画問題です。

このサンプルでは、`m.continuous(factories, stores)` を使って **`ship[factory][store]` のような2次元インデックス変数**を1行で構築し、`dot()` による2次元コスト行列の内積や、`m.constrain(expr`...`)` での集計制約の書き方を学びます。

## 入力データ

3つの工場（`Tokyo`, `Nagoya`, `Osaka`）から4つの店舗（`North`, `East`, `West`, `South`）へ配送します。

| 工場 \ 店舗 | North ($/個) | East ($/個) | West ($/個) | South ($/個) | 工場の供給上限 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** 個 |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** 個 |
| **Osaka** | $9 | $7 | $2 | $3 | **80** 個 |
| **店舗の需要量** | **70** 個 | **90** 個 | **60** 個 | **60** 個 | 合計: 280 / 300 |

## WaSHI による実装

<CodeRunner preset="transportation">

```typescript
import { Model, sum, dot, expr } from "@ohtaman/washi";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

const shippingCost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };
const demands = { North: 70, East: 90, West: 60, South: 60 };

async function runTransportation() {
  const m = new Model("TransportationNetwork");

  // 1. 2次元決定変数の生成: ship[factory][store] >= 0
  const ship = m.continuous([...factories], [...stores], { lb: 0 });

  // 2. 目的関数: 2次元内積による総輸送コストの最小化
  m.minimize(dot(shippingCost, ship));

  // 3. 供給上限（行方向の合計）: 各工場からの総出荷量 <= supplies[f]
  for (const f of factories) {
    m.constrain(
      expr`${sum(stores, (s) => ship[f][s])} <= ${supplies[f]}`,
      `supply_${f}`
    );
  }

  // 4. 需要充足（列方向の合計）: 各店舗への総入荷量 >= demands[s]
  for (const s of stores) {
    m.constrain(
      expr`${sum(factories, (f) => ship[f][s])} >= ${demands[s]}`,
      `demand_${s}`
    );
  }

  const status = await m.optimize();
  console.log(`Status: ${status}, Total Shipping Cost: $${m.objectiveValue}`);
  for (const f of factories) {
    const routes = stores
      .map((s) => `${s}:${Math.round(ship[f][s].value ?? 0)}`)
      .join(", ");
    console.log(`  ${f.padEnd(7)} -> ${routes}`);
  }
}

runTransportation();
```

</CodeRunner>
