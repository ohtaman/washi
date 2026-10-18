# 数式の記述 (`expr`, `sum`, `dot`)

数式は、決定変数と数値係数の線形または2次結合です。

演算子オーバーロード（`+`, `*` 等）を持たない JavaScript / TypeScript において、WaSHI は **`expr` タグ付きテンプレートリテラル**、総和関数 **`sum()`**、およびベクトル・行列の内積関数 **`dot()`** を提供し、静的型安全性を保ったまま数式を記述できるようにしています。

| アプローチ | 記述例 | 数式の可読性 | 型安全性・IDE リネーム | 添字付き変数 (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| メソッドチェーン | `x.mul(30).add(y.mul(50)).le(40)` | 低い | あり | あり |
| 生文字列パース | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | 高い | なし（実行時の名前解決） | 文字列結合が必要で壊れやすい |
| **タグ付きテンプレート (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **高い** | **あり（TS の変数参照）** | **あり（オブジェクト参照で直接バインド）** |

---

## ✍️ タグ付きテンプレートリテラル (`expr`)

SQL クエリビルダ（`sql` タグ）のパラメータバインディングと同様に、`expr` は演算子部分の文字列（`+`, `-`, `*`, `^2`, `<=`, `>=`, `==`）と `${...}` に埋め込まれた値（`Var`, `LinExpr`, `QuadExpr`, 有限の `number`）を分離して受け取ります。変数名の文字列一致ではなくオブジェクト参照として直接バインドされるため、変数名の衝突を気にする必要がなく、TypeScript の型検査や IDE のシンボルリネーム（F2）がそのまま効きます。

算術式（`LinExpr | QuadExpr`）と関係演算子による制約条件（`Constraint`）の両方に `expr` を使用します：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 線形結合: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. 2次式: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. 関係制約条件:
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### `expr` でサポートされる構文
- **加算と減算**: `${x} + ${y} - 5`
- **スカラー乗算**: `4 * ${x}`, `${x} * 4`
- **変数同士の乗算（2次項）**: `${x} * ${y}`, `2 * ${x} * ${x}`
- **べき乗・二乗**: `${x}^2`, `${x}**2`
- **単項マイナス**: `-${x} + 10`
- **丸括弧**: `2 * (${x} + ${y})`
- **ネスト式**: 変数、数値、`sum()` の結果、およびネストした式を自然に埋め込めます。

> [!NOTE]
> 関係演算子（`<=`, `>=`, `==`）を含む比較制約では、`expr`（例: ``expr`${x} + 2 * ${y} <= 40` ``）はファーストクラスの `Constraint` を返します。
> 比較演算子を含まない算術式では、`expr` は線形式および2次式（次数2以下）を統一的に扱います（2次項が含まれる場合は `QuadExpr` を返し、すべて線形項の場合は `LinExpr` を返します）。次数3以上の非線形多項式（例: ``${x} * ${y} * ${z}``, ``${x}^3``）や非線形制約（例: ``${x} * ${y} <= 10``）は、MILP/LP/QP の定式化要件（線形制約かつ次数2以下の目的関数）に基づきエラーとなります。

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
m.objective(minimize(dot(costs, ship)));
```

---

## 🧮 2次式 (`QuadExpr` & `expr`)

WaSHI は HiGHS ソルバーによる凸2次計画問題（QP）を標準でサポートしています。2次目的関数は、`expr` テンプレートリテラルを用いて直感的に記述することも、`QuadExpr` や `.mul()` メソッドを使って代数的に構築することも可能です：

### 1. `expr` による統一的な記述（推奨）
`*` や `^2`, `**2` を用いて、直感的に2次目的関数を記述できます：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// expr による2次目的関数:
m.objective(minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`));

// 線形制約 (expr タグを使用):
m.constraint(expr`${x} + ${y} >= 4`);
```

### 2. `.mul()` や `QuadExpr` による構築
プログラム的に2次式を組み立てることも可能です：

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

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

m.objective(minimize(risk));
```

---

## 📊 求解後の数式評価 (`.value`)

`LinExpr` と `QuadExpr` は `.value` ゲッター（`number | null`）を備えています。モデルの求解後、式に含まれるすべての変数に解が格納されていれば、部門別コストやリソース使用量などの部分式をそのまま評価できます：

```typescript
const revenue = expr`30 * ${x} + 50 * ${y}`;
const laborUsed = expr`2 * ${x} + ${y}`;

m.objective(maximize(revenue));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_cap");
m.constraint(expr`${laborUsed} <= 50`, "labor_cap");

await m.solve();

console.log("総売上:", revenue.value);       // 1100 (x = 20, y = 10)
console.log("労働力使用量:", laborUsed.value); // 50
```

未求解の場合（または式内のいずれかの変数が `value === null` の場合）は `null` を返します。

---

## 🔗 メソッドチェーンによる算術・比較メソッド

`expr` タグに加えて、`Var`, `LinExpr`, `QuadExpr` は不変（イミュータブル）なメソッドを備えており、動的な式の組み立てに利用できます：

| メソッド | 対象クラス | 戻り値 | 説明 |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 数値、`Var`、`LinExpr`、`QuadExpr` を加算します。 |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 数値、`Var`、`LinExpr`、`QuadExpr` を減算します。 |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | スカラー倍、または1次式同士の積（`QuadExpr`）を計算します。 |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 非ゼロの有限スカラー数値で除算します。 |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 符号を反転します（$-e$）。 |
| `.le(rhs)` | `Var`, `LinExpr` | `Constraint` | $\le$ 制約（`lhs <= rhs`）を生成します。 |
| `.ge(rhs)` | `Var`, `LinExpr` | `Constraint` | $\ge$ 制約（`lhs >= rhs`）を生成します。 |
| `.eq(rhs)` | `Var`, `LinExpr` | `Constraint` | $==$ 等式制約（`lhs == rhs`）を生成します。 |

