# 数式の記述 (`expr`, `sum`, `dot`)

数式は、決定変数と数値係数の線形または2次結合です。

演算子オーバーロード（`+`, `*` 等）を持たない JavaScript / TypeScript において、WaSHI は **`expr` タグ付きテンプレートリテラル**、総和関数 **`sum()`**、およびベクトル・行列の内積関数 **`dot()`** を提供し、静的型安全性を保ったまま数式を記述できるようにしています。

| アプローチ | 記述例 | 数式の可読性 | 型安全性・IDE リネーム | 添字付き変数 (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| メソッドチェーン | `x.mul(30).add(y.mul(50)).le(40)` | 低い | あり | あり |
| 生文字列パース | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | 高い | なし（実行時の名前解決） | 文字列結合が必要で壊れやすい |
| **タグ付きテンプレート (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **高い** | **あり（TS の変数参照）** | **あり（オブジェクト参照で直接バインド）** |

---

## タグ付きテンプレートリテラル (`expr`)

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
- **スカラー乗算と除算**: `4 * ${x}`, `${x} / 2`
- **変数同士の乗算（2次項）**: `${x} * ${y}`, `2 * ${x} * ${x}`
- **べき乗・二乗**: `${x}^2`, `${x}**2`
- **単項プラスとマイナス**: `-${x} + 10`, `+${x}`
- **丸括弧**: `2 * (${x} + ${y})`
- **集計関数 (`sum` & `dot`)**: `sum(${xVec}) <= 100`, `dot(${costs}, ${xVec})`, `sum(${rows}, ${(r) => grid[r][col]})`
- **コンテナの要素ごとの四則演算**: `sum((${price} - ${cost}) * ${qty})`, `sum((${xVec} - ${target})^2)`, `dot(${price} - ${cost}, ${qty})`
- **ネスト式**: 変数、数値、`Array` / `Record` コンテナ（`sum` または `dot` の内部）、およびネストした `LinExpr` / `QuadExpr` を埋め込めます。

> [!NOTE]
> 関係演算子（`<=`, `>=`, `==`）を含む比較制約では、`expr`（例: ``expr`${x} + 2 * ${y} <= 40` ``）はファーストクラスの `Constraint` を返します。
> 比較演算子を含まない算術式では、`expr` は線形式および2次式（次数2以下）を統一的に扱います（2次項が含まれる場合は `QuadExpr` を返し、すべて線形項の場合は `LinExpr` を返します）。埋め込まれた `Array` や `Record` コンテナは、`sum(...)` または `dot(..., ...)` でスカラーに縮約する必要があります。次数3以上の非線形多項式（例: ``${x} * ${y} * ${z}``, ``${x}^3``）や非線形制約（例: ``${x} * ${y} <= 10``）は、LP/MIP/QP の仕様（線形制約かつ次数2以下の目的関数）に基づきエラーとなります。

---

## 高速な総和関数 (`sum`)

1次元・2次元の `Array`, `Iterable`, `Record`（辞書）コンテナに対して、`` expr`sum(...)` `` の内部またはスタンドアロンの `sum()` 関数で直接総和を計算できます：

```typescript
import { expr, sum } from "@ohtaman/washi";

const items = ["A", "B", "C"] as const;
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. expr 内で Record や配列を直接集計（Object.values() 不要）:
m.constraint(expr`sum(${x}) <= 2`, "max_selected");

// 2. expr`sum(...)` 内での要素積・要素ごとの四則演算:
const weightedExpr = expr`sum(${weights} * ${x})`;

// 3. マッピングコールバック関数による変換集計:
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 4. スタンドアロン sum() でも 1D/2D Record や配列を直接集計可能:
const count = sum(x);
```

`sum()` は AST パースのオーバーヘッドなしに $O(N)$ 線形時間で動作します。

> [!TIP]
> **ループ内での `expr` の再代入（$O(N^2)$）を避ける**: `LinExpr` や `expr` の結果は不変（イミュータブル）であるため、ループの中で ``total = expr`${total} + ${x[i]}` `` のように1項ずつ加算すると、反復ごとに既存の全項がコピーされ $O(N^2)$ の時間・メモリを消費します。多数の変数を集計する際は、`sum(x)` または `dot(coeffs, x)` を使用して $O(N)$ で構築してください。

---

## 内積関数 (`dot`)

`dot(a, b)`（`` expr`dot(${a}, ${b})` `` の内部およびスタンドアロン関数 `dot(a, b)` の両方で使用可能）は、数値係数（`number`）と決定変数または1次式（`Var | LinExpr`）の線形結合を、引数の順序を問わず（`dot(coeffs, vars)` または `dot(vars, coeffs)`）計算します。

サポートされる 1次元・2次元コンテナ構造：
- **1次元配列**: `number[]` $\times$ `(Var | LinExpr)[]`
- **1次元辞書**: `Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **2次元配列**: `number[][]` $\times$ `(Var | LinExpr)[][]`
- **2次元辞書**: `Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **2次元混合コンテナ**: `Array<Record<C, ...>>` または `Record<R, Array<...>>`

配列長や辞書キーの不一致、あるいは非有限値・非線形要素が含まれている場合は、該当する要素パス（例: `at '[0].StoreB'`）を明示したエラーをスローします。

### 1次元ベクトルの内積
```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// expr 内で 30 * vars.desk + 50 * vars.chair を計算（dot(profits, vars) と同等）
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 2次元行列の内積（フロベニウス内積）
2次元配列（`m.continuous(rows, cols)`）、ネストされた辞書（`m.continuous(rowKeys, colKeys)`）、または混合2次元コンテナと直接連携します：

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// 全ルートの輸送コスト総和を1行で記述（expr`sum(${costs} * ${ship})` と同等）:
const totalShippingCost = expr`dot(${costs}, ${ship})`;
```

> [!NOTE]
> **2次元の `dot(A, B)` はフロベニウス内積（Frobenius Inner Product）です**: 2次元配列や2次元辞書に対する `dot(A, B)` は、行列積 $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$ ではなく、対応する全要素の積和スカラー $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$（`` expr`sum(${A} * ${B})` `` と同等）を計算します。

---

## `expr` による集計・一括記述の書き方

### 演算子とデータの分離

演算子・`sum(...)`・`dot(..., ...)`・比較記号（`<=`, `>=`, `==`）はテンプレート文字列側に記述し、`${...}` には変数・定数・コンテナ（配列・辞書）を渡します：

```typescript
// テンプレートのネストと Object.values() を使った冗長な記述
const totalProfit1 = expr`${dot(profits, vars)}`;
const cap1 = expr`${sum(Object.values(vars))} <= 100`;

// sum() と dot() を expr 内に直接記述（推奨）
const totalProfit2 = expr`dot(${profits}, ${vars})`;
const cap2 = expr`sum(${vars}) <= 100`;
```

### 主な集計・一括記述の構文一覧

| 操作 | 数式 | WaSHI での記述例 |
| :--- | :--- | :--- |
| **全体の合計**（1D/2D の配列・辞書） | $\sum_i x_i \le C$ | `` m.constraint(expr`sum(${x}) <= ${C}`) `` |
| **内積**（1D ベクトル / 2D フロベニウス内積） | $\sum_i c_i x_i \le B$ | `` m.constraint(expr`dot(${c}, ${x}) <= ${B}`) `` |
| **要素ごとの差・積の合計** | $\sum_i (p_i - c_i) \cdot x_i$ | `` expr`sum((${price} - ${cost}) * ${x})` `` |
| **二乗誤差の合計（QP）** | $\sum_i (x_i - t_i)^2$ | `` expr`sum((${x} - ${target})^2)` `` |
| **要素ごとの一括制約**（全 $i \in I$） | $a_i x_i \le b_i \quad (\forall i)$ | `` m.constraint(items.map((i) => expr`${a[i]} * ${x[i]} <= ${b[i]}`)) `` |
| **2次元変数の行和**（各行 $f$） | $\sum_s X_{f,s} \le S_f \quad (\forall f)$ | `` m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`)) `` |
| **2次元変数の列和**（各列 $s$） | $\sum_f X_{f,s} \ge D_s \quad (\forall s)$ | `` m.constraint(stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)) `` |

---

## 2次式 (`QuadExpr` & `expr`)

WaSHI は HiGHS ソルバーによる凸2次計画問題（QP）の目的関数をサポートしています。2次式は `expr` テンプレートリテラルを用いて記述することも、`QuadExpr` や `.mul()` メソッドで組み立てることも可能です。

### 1. `expr` による記述（推奨）
`*` や `^2`, `**2` を用いて2次目的関数を記述できます：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// expr による2次目的関数:
m.objective(minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`));

// 線形制約:
m.constraint(expr`${x} + ${y} >= 4`);
```

### 2. `.mul()` や `QuadExpr` による構築
プログラム的に2次式を組み立てることも可能です：

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. .mul() による2次項の構築 (x * y + 2 * x^2)
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. ポートフォリオ分散目的関数 w^T * Sigma * w の構築:
const assets = ["Tech", "Bonds"] as const;
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.objective(minimize(risk));
```

> [!NOTE]
> **凸性条件（半正定値性 $\mathbf{Q} \succeq 0$）**: HiGHS を含む QP ソルバーで最小化を行う場合、2次形式の係数行列 $\mathbf{Q}$ が**半正定値（PSD）**である必要があります（最大化の場合は半負定値）。二乗和（$\sum_i (x_i - t_i)^2$）や共分散行列（$\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$）は常に半正定値ですが、連続変数同士の不定な積（$x \cdot y$ の最小化など）は非凸となりソルバーでエラーになります。（*MIP におけるバイナリ変数同士の積 $x_A \cdot x_B$ の線形化については [定式化パターン・Tips](./formulation-tips.md#binary-product) を参照してください。*）

---

## 求解後の数式評価 (`.value`)

`LinExpr` と `QuadExpr` は `.value` ゲッター（`number | null`）を備えています。モデルの求解後、式に含まれるすべての変数に有限の解が格納されていれば、部分式の値を直接取得できます：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

const revenue = expr`30 * ${x} + 50 * ${y}`;
const laborUsed = expr`2 * ${x} + ${y}`;

m.objective(maximize(revenue));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_cap");
m.constraint(expr`${laborUsed} <= 50`, "labor_cap");

await m.solve();

console.log("総売上:", revenue.value);         // 1100 (x = 20, y = 10)
console.log("労働力使用量:", laborUsed.value); // 50
```

未求解の場合（または式内のいずれかの変数が `value === null` の場合）は `null` を返します。

---

## メソッドチェーンによる算術・比較メソッド

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
