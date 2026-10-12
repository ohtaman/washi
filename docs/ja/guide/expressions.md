# 数式の記述 (`expr`, `sum`, `dot`)

数式は、決定変数と数値係数の線形または2次結合です。

JavaScript / TypeScript には演算子オーバーロード（`+`, `*` 等）がないため、WaSHI は **`expr` タグ付きテンプレートリテラル**、高速な総和関数 **`sum()`**、およびベクトル・行列の内積関数 **`dot()`** を提供し、代数的なモデリングを簡潔かつ表現力豊かに記述できます。

---

## ✍️ タグ付きテンプレートリテラル (`expr`)

`expr` テンプレートタグにより、直感的かつ自然な代数数式として表現できます：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 線形結合: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// インライン線形制約
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### `expr` でサポートされる構文
- **加算と減算**: `${x} + ${y} - 5`
- **スカラー乗算**: `4 * ${x}`, `${x} * 4`
- **単項マイナス**: `-${x} + 10`
- **丸括弧**: `2 * (${x} + ${y})`
- **線形比較**: `${x} + 2 * ${y} <= 40`, `${x} >= 10`, `${x} == ${y}`
- **ネスト式**: 変数、数値、`sum()` の結果、およびネストした式を自然に埋め込めます。

> [!NOTE]
> `expr` は線形式（`LinExpr`）および線形制約（`Constraint`）の記述に対応しています。変数同士の乗算は非線形項となるため `expr` では未対応です。凸二次計画問題（QP）の2次目的関数を記述する場合は、`QuadExpr` または `.mul()` を使用してください。

---

## ⚡ 高速な総和関数 (`sum`)

変数の配列や反復集合に対して効率的に総和を計算します：

```typescript
import { sum } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. マッピングコールバック関数による変換集計:
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 2. 配列の直接総和:
const count = sum(Object.values(x));
```

`sum()` は AST パースのオーバーヘッドなしに $O(N)$ 線形時間で高速に動作します。

---

## 🎯 内積関数 (`dot`)

`dot(coefficients, variables)` は、係数と変数の内積（線形結合）をワンライナーで計算します。

### 1次元ベクトルの内積
```typescript
import { dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"]);

// 30 * vars.desk + 50 * vars.chair を計算
const totalProfit = dot(profits, vars);
```

### 2次元行列の内積
ネストされた辞書や2次元配列とも直接連携します：

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// 総輸送コストを1行で記述:
m.minimize(dot(costs, ship));
```

---

## 🧮 2次式 (`QuadExpr`)

WaSHI は HiGHS ソルバーによる凸2次計画問題（QP）を標準でサポートしています。`expr` が線形項を扱うのに対し、2次項は `QuadExpr` または変数同士の `.mul()` メソッドを使って構築します：

```typescript
import { Model, QuadExpr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. .mul() による2次項の構築:
// x * y + 2 * x^2 を表現
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. 2次目的関数（ポートフォリオのリスク項 w^T * Sigma * w など）の構築:
const assets = ["Tech", "Bonds"];
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.minimize(risk);
```
