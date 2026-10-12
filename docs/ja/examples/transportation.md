# 輸送・物流ネットワーク問題 (LP)

**問題クラス:** 線形計画問題 (LP) · **ソルバー:** HiGHS (標準) · **主な API:** `m.addVars(rows, cols)`, `sum()`, `constr.dual`  
**[`</> Playground で開く`](https://ohtaman.github.io/washi/demo/?preset=transportation)** · **ソースコード:** [`examples/node/09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts)

複数の工場（供給拠点）から複数の店舗（需要拠点）へ商品を配送する際、各工場の供給能力上限と各店舗の需要量を満たしながら、総輸送コストを最小化する定番の線形計画問題です。

このサンプルでは、`m.addVars(factories, stores)` を使って **`ship[factory][store]` のような2次元インデックス変数**を1行で構築し、`sum()` で行方向・列方向の合計制約を簡潔に記述する方法を学びます。

---

## 入力データ

3つの工場（`Tokyo`, `Nagoya`, `Osaka`）から4つの店舗（`North`, `East`, `West`, `South`）へ配送します。

| 工場 \ 店舗 | North ($/個) | East ($/個) | West ($/個) | South ($/個) | 工場の供給上限 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** 個 |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** 個 |
| **Osaka** | $9 | $7 | $2 | $3 | **80** 個 |
| **店舗の需要量** | **70** 個 | **90** 個 | **60** 個 | **60** 個 | 合計: 280 / 300 |

---

## WaSHI による実装

```typescript
import { Model, sum } from "@ohtaman/washi";

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
  const m = new Model({ name: "TransportationNetwork", sense: "Minimize" });

  // 1. 2次元辞書変数の生成: ship[factory][store] >= 0
  const ship = m.addVars([...factories], [...stores], { lb: 0, prefix: "ship" });

  // 2. 目的関数: 全ルートの輸送コスト合計を最小化
  const costTerms = [];
  for (const f of factories) {
    for (const s of stores) {
      costTerms.push(ship[f][s].mul(shippingCost[f][s]));
    }
  }
  m.minimize(sum(costTerms));

  // 3. 供給上限（行方向の合計）: 各工場からの総出荷量 <= supplies[f]
  for (const f of factories) {
    m.addConstraint(
      sum(stores.map((s) => ship[f][s])).le(supplies[f]),
      `supply_${f}`
    );
  }

  // 4. 需要充足（列方向の合計）: 各店舗への総入荷量 >= demands[s]
  for (const s of stores) {
    m.addConstraint(
      sum(factories.map((f) => ship[f][s])).ge(demands[s]),
      `demand_${s}`
    );
  }

  const status = await m.solve();
  console.log(`Status: ${status}, Total Cost: $${m.objectiveValue}`);
}

runTransportation();
```

---

## 実行結果とパラメータ変化の影響

`npx tsx examples/node/09-transportation-problem.ts` を実行すると、通常時の最適輸送計画（Scenario A）と、Tokyo 工場の供給上限が `120 -> 80` に減少した場合の代替フロー（Scenario B）を比較できます。

```text
--- Scenario A: Baseline Supply Capacities ---
Status: Optimal (model build: 0.76ms, solve: 23.80ms)
Total Shipping Cost: $880

Optimal Shipment Plan (units):
Factory \ Store    North    East    West   South  | Used / Cap
--------------------------------------------------------------
Tokyo                 30      90       ·       ·  | 120 / 120
Nagoya                40       ·      40       ·  |  80 / 100
Osaka                  ·       ·      20      60  |  80 / 80

--- Scenario B: Tokyo Capacity Constrained (120 -> 80) ---
Status: Optimal (model build: 0.15ms, solve: 0.87ms)
Total Shipping Cost: $940

Optimal Shipment Plan (units):
Factory \ Store    North    East    West   South  | Used / Cap
--------------------------------------------------------------
Tokyo                  ·      80       ·       ·  |  80 / 80
Nagoya                70      10      20       ·  | 100 / 120
Osaka                  ·       ·      40      60  | 100 / 100
```
