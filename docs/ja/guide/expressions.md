# 数式の記述 (`expr`, `sum`, `dot`)

数式は、決定変数と数値係数の線形結合または2次式です。
JavaScript / TypeScript には演算子オーバーロードがないため、WaSHI では `expr` タグ付きテンプレートリテラルと `sum()`・`dot()` を提供しています。
これにより、静的型安全性を保ったまま読みやすい代数式を記述できます。

| アプローチ | 記述例 | 数式の可読性 | 型安全性・IDE リネーム | 添字付き変数 (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| メソッドチェーン | `x.mul(30).add(y.mul(50)).le(40)` | 低い | あり | あり |
| 生文字列パース | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | 高い | なし（実行時の名前解決） | 文字列結合が必要で壊れやすい |
| **タグ付きテンプレート (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **高い** | **あり（TS の変数参照）** | **あり（オブジェクト参照で直接バインド）** |

---

## タグ付きテンプレートリテラル (`expr`)

パラメータ化 `sql` テンプレートと同様、`expr` は演算子文字列（`+`, `-`, `*`, `^2`, `<=`, `>=`, `==`）と `${...}` の埋め込み値を分けて受け取ります。
埋め込み値には `Var`・`LinExpr`・`QuadExpr`・有限の `number` を直接渡せます。
変数は名前文字列ではなくオブジェクト参照でバインドされるため、名前衝突を防ぎつつ IDE のリネーム機能もそのまま使えます。

算術式（`LinExpr | QuadExpr`）と比較制約（`Constraint`）の両方に `expr` を使います。

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 線形結合: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. 2次式: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. 比較制約:
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### `expr` でサポートされる構文

- **加算・減算**: `${x} + ${y} - 5`
- **スカラー乗算・除算**: `4 * ${x}`, `${x} / 2`
- **2次項・べき乗**: `${x} * ${y}`, `2 * ${x} * ${x}`, `${x}^2`, `${x}**2`
- **単項符号・丸括弧**: `-${x} + 10`, `+${x}`, `2 * (${x} + ${y})`
- **集計関数**: `sum(${xVec}) <= 100`, `dot(${costs}, ${xVec})`, `sum(${rows}, ${(r) => grid[r][col]})`
- **区分線形関数・インデックス参照**: `max(${xVec}) <= 15`, `sum(abs(${w} - ${target}))`, `at(${costs}, ${idx})`（[区分線形関数・インデックス参照](#piecewise-linear) 参照）
- **コンテナの要素ごとの四則演算**: `sum((${price} - ${cost}) * ${qty})`, `sum((${xVec} - ${target})^2)`, `dot(${price} - ${cost}, ${qty})`
- **ネスト式**: 変数・数値・ネストした `LinExpr` / `QuadExpr`、および `sum` / `dot` 内のコンテナを埋め込めます。

> [!NOTE]
> - **比較式（`<=`, `>=`, `==`）** は `Constraint` オブジェクトを返します。
> - **算術式** は 1 次なら `LinExpr`、2 次なら `QuadExpr` を返します。埋め込んだ配列や辞書は `sum(...)` か `dot(..., ...)` でスカラーにまとめてください。
> - **未対応の非線形式**: 3 次以上の項（`${x}^3` など）や非線形制約（`${x} * ${y} <= 10` など）はエラーになります。

---

## 高速な総和関数 (`sum`)

`sum()` は、1次元・2次元の `Array`・`Iterable`・`Record` コンテナの総和を計算します。
`` expr`sum(...)` `` の内部でもスタンドアロン関数としても使え、式の再コピーなしで $O(N)$ 線形時間に動作します。

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

> [!TIP]
> **ループ内での `expr` の再代入（$O(N^2)$）を避ける**: `LinExpr` オブジェクトは不変（イミュータブル）です。
> ループ内で ``total = expr`${total} + ${x[i]}` `` を繰り返すと、毎回すべての既存項がコピーされ $O(N^2)$ の時間とメモリを消費します。
> 多数の変数を集計する際は `sum()` または `dot()` を使い、$O(N)$ で構築してください。

---

## 内積関数 (`dot`)

`dot(a, b)` は、数値係数（`number`）と変数または1次式（`Var | LinExpr`）の重み付き線形結合を計算します。
`` expr`dot(${a}, ${b})` `` 内部でもスタンドアロン関数としても使え、引数の順序はどちらでも構いません（`dot(coeffs, vars)` / `dot(vars, coeffs)`）。

サポートされる 1次元・2次元コンテナ構造：
- **1次元配列**: `number[]` $\times$ `(Var | LinExpr)[]`
- **1次元辞書**: `Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **2次元配列**: `number[][]` $\times$ `(Var | LinExpr)[][]`
- **2次元辞書**: `Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **2次元混合コンテナ**: `Array<Record<C, ...>>` または `Record<R, Array<...>>`

配列長の不一致、辞書キーの欠落、無効な要素がある場合は、該当パス（例：`at '[0].StoreB'`）を示すエラーをスローします。

### 1次元ベクトルの内積

```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// expr 内で 30 * vars.desk + 50 * vars.chair を計算
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 2次元行列の内積（フロベニウス内積）

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// 全ルートの輸送コスト総和を1行で記述:
const totalShippingCost = expr`dot(${costs}, ${ship})`;
```

> [!NOTE]
> **2次元の `dot(A, B)` はフロベニウス内積です**: 2次元配列やネスト辞書に対する `dot(A, B)` は、対応する全要素の積和スカラー $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$ を計算します。
> 行列積 $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$ では**ありません**。

---

## `expr` による集計・一括記述の書き方

`sum(...)`・`dot(..., ...)`・比較記号はテンプレート文字列側に直接書き、`Object.values()` や事前呼び出しのネストを避けると簡潔になります。

```typescript
// テンプレートのネストと Object.values() を使った冗長な記述
const totalProfit1 = expr`${dot(profits, vars)}`;
const cap1 = expr`${sum(Object.values(vars))} <= 100`;

// sum() と dot() を expr 内に直接記述（推奨）
const totalProfit2 = expr`dot(${profits}, ${vars})`;
const cap2 = expr`sum(${vars}) <= 100`;
```

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

WaSHI は HiGHS による凸2次計画問題（QP）の目的関数をサポートしています。
2次式は `expr` テンプレートリテラルでも、`QuadExpr` や `.mul()` によるプログラム構築でも記述できます。

### 1. `expr` による記述（推奨）

`*` や `^2`, `**2` で2次目的関数を記述します。

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

プログラム的に2次式を組み立てることもできます。

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
> **凸性条件（半正定値性 $\mathbf{Q} \succeq 0$）**: 2次目的関数を最小化する場合、HiGHS では2次形式の係数行列 $\mathbf{Q}$ が**半正定値（PSD）**である必要があります。
> 最大化の場合は半負定値である必要があります。
> 二乗和（$\sum_i (x_i - t_i)^2$）や共分散行列（$\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$）は常に半正定値です。
> 一方、連続変数同士の不定な積（$x \cdot y$ の最小化など）は非凸となり、ソルバーでエラーになります。
> MILP でバイナリ変数同士の積 $x_A \cdot x_B$ を線形化する方法は、[定式化パターン・Tips](./formulation-tips.md#binary-product) を参照してください。

---

## 区分線形関数・インデックス参照 (`max`, `min`, `abs`, `at`) {#piecewise-linear}

WaSHI は区分線形関数（`max`, `min`, `abs`）と 0 始まりの変数インデックス参照（`at`）を提供しています。
いずれも `` expr`...` `` タグ内と `@ohtaman/washi` のスタンドアロン関数の両方で使えます。

```typescript
import { Model, expr, minimize, abs, max, min, at } from "@ohtaman/washi";

const m = new Model();
const w = m.continuous(3, { lb: 0, ub: 20, prefix: "w" });
const target = [4, 7, 10];
const route = m.integer("route", { lb: 0, ub: 2 });
const routeCost = [18, 12, 25];

// 凸方向（max/abs の最小化など）はバイナリ変数なしの純粋な線形計画に変換：
m.objective(
  minimize(expr`sum(abs(${w} - ${target})) + at(${routeCost}, ${route})`)
);
m.constraint(expr`max(${w}) <= 15`, "peak_cap");

// ネスト合成やスタンドアロン関数呼び出しにも対応：
const maxErr = max(expr`abs(${w[0]} - 4)`, abs(expr`${w[1]} - 7`));
m.constraint(expr`${maxErr} <= 3`);
```

### コンテナ要素ごとの展開

`expr` 内では、`abs(${arr} - ${target})` が 1D・2D の `Array`・`Iterable`・`Record` に対して要素ごとに展開されます。
そのため、`` expr`sum(abs(${w} - ${target}))` `` や `` expr`max(abs(${pred} - ${actual}))` `` をそのまま記述できます。

### 各ソルバーでの `max`・`min`・`abs` の扱い

**凸方向**（`max`・`abs` の最小化や `<=` 制約、および `min` の最大化や `>=` 制約）では、HiGHS と GLPK は連続の補助変数1つと単純な線形不等式へ変換します。
このエピグラフ定式化には**バイナリ変数が一切不要**で、無界な連続変数にもそのまま使えます。

**非凸方向や等式コンテキスト**（`minimize(min(...))`, `maximize(abs(...))`, `max(...) >= rhs`, `abs(...) == rhs`）では、ソルバーごとに次のように処理されます。

- **HiGHS・GLPK**: 厳密な MIP 符号化を行うため、関与する全変数に有限の上下限が必要です。
- **Pumpkin**: 有界整数に対するネイティブ制約として求解します。
- **Z3**: ネイティブの条件分岐（`If`）として表現します。

### 0 始まりインデックス参照 (`at(array, index)`)

`at(array, index)` は制約プログラミングの `Element` 制約に相当し、配列の添字自体を決定変数にできます（`array[index]`）。
`index` には整数値の式を指定する必要があり、全ソルバー共通で $0 \le \text{index} < \text{array.length}$ が自動で強制されます。
Pumpkin と Z3 はネイティブに処理し、HiGHS と GLPK はバイナリ選択変数で線形化します（配列要素に決定変数が含まれる場合は有限の上下限が必要です）。

---

## 求解後の数式評価 (`.value`)

`LinExpr` と `QuadExpr` は、`number | null` を返す `.value` ゲッターを備えています。
モデルの求解後、式に含まれるすべての変数に有限の解が格納されていれば、任意の部分式の値を直接評価できます。

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

未求解の場合、または式内のいずれかの変数が `value === null` の場合は `null` を返します。

---

## メソッドチェーンによる算術・比較メソッド

`expr` タグに加えて、`Var`, `LinExpr`, `QuadExpr` は不変（イミュータブル）なメソッドを備えており、動的な式の組み立てに利用できます。

| メソッド | 対象クラス | 戻り値 | 説明 |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 数値、`Var`、`LinExpr`、`QuadExpr` を加算します。 |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 数値、`Var`、`LinExpr`、`QuadExpr` を減算します。 |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | スカラー倍、または1次式同士の積（`QuadExpr`）を計算します。 |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 非ゼロの有限スカラー数値で除算します。 |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` または `QuadExpr` | 符号を反転します（$-e$）。 |
| `.le(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | $\le$ 制約（`lhs <= rhs`。左辺は線形である必要があります）を生成します。 |
| `.ge(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | $\ge$ 制約（`lhs >= rhs`。左辺は線形である必要があります）を生成します。 |
| `.eq(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | $==$ 等式制約（`lhs == rhs`。左辺は線形である必要があります）を生成します。 |
| `.lt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 離散 $<$ 制約（`lhs - rhs <= -1`。整数値式のみ）を生成します。 |
| `.gt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 離散 $>$ 制約（`lhs - rhs >= 1`。整数値式のみ）を生成します。 |
| `.ne(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 離散 $\ne$ 制約（`lhs != rhs`。整数値式のみ）を生成します。 |
