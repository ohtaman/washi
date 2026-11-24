# 決定変数とドメイン (`Variables`)

決定変数は、数理最適化や論理検証モデルにおいて求めたい未知数を表します。
WaSHI では、`Model` インスタンス上の4つのファクトリメソッド（`m.continuous()`, `m.integer()`, `m.binary()`, `m.bool()`）で変数を定義します。

---

## 決定変数の種類

### 1. 連続変数 (`m.continuous`)

指定した範囲 `[lb, ub]` 内の任意の実数値をとる変数です。
流量、重量、予算配分、投資比率などの分割可能な連続量に使います。

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// [0, 1000] の範囲の単一連続変数
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. 整数変数 (`m.integer`)

指定した範囲 `[lb, ub]` 内の整数値のみをとる変数です。
車両台数、生産個数、人員数などの分割できない数量に使います。

```typescript
// [0, 15] の範囲の単一整数変数
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. 0-1 バイナリ変数 (`m.binary`)

数値として $\{0, 1\}$ のみをとる変数で、`lb = 0`・`ub = 1` が自動設定されます。
混合整数計画（MIP）で、総和や目的関数のコスト項に含まれる Yes/No の意思決定に使います。

```typescript
// 単一のバイナリ変数 (lb = 0, ub = 1 に自動設定)
const openWarehouse = m.binary("open_warehouse");
```

### 4. 命題論理変数 (`m.bool`)

真偽値（`true` / `false`）をとる論理変数です。
論理演算子（`and`, `or`, `not`, `implies`, `xor`）を使う論理規則や SMT（充足可能性モジュロ理論）モデルに使います。

```typescript
// 単一の命題論理変数
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");

// 論理演算子: and, or, not, implies, xor
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");
```

### `m.binary()` と `m.bool()` の使い分け

| 比較項目 | `m.binary()` (`Var`) | `m.bool()` (`BoolVar`) |
| :--- | :--- | :--- |
| **求解後の `.value` の型** | `number \| null`（厳密な `0` または `1`） | `boolean \| null`（`true` または `false`） |
| **線形算術式（`expr`, `sum`, `dot`, 目的関数の係数）** | ✅ そのまま記述可能（`` expr`30 * ${b}` ``） | ❌ 数値との積や `sum()` には直接使えない |
| **インジケータ制約（`m.indicator(b, ...)`）** | ✅ トリガー変数として使用可能 | ❌ 代わりに `` implies(flag, expr`...`) `` を使用 |
| **命題論理演算（`and`, `or`, `not`, `implies`, `xor`）** | 比較式経由（`` expr`${b} == 1` ``） | ✅ メソッド・関数で直接記述可能（`.implies()`, `.and()`） |
| **主な用途** | 個数の合計、目的関数のコスト、`m.indicator()` | 数値係数なしの論理条件 |

---

## 配列・辞書・2次元マトリクスの一括生成

各ファクトリメソッド（`continuous`, `integer`, `binary`, `bool`）は要素数やキー配列を受け取ります。
これにより、1次元配列・型付き辞書・2次元マトリクスを1回の呼び出しで生成できます。

### 要素数（Count）による 1次元配列生成

数値を渡すと変数の配列を生成します。

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### キー配列による 1次元辞書の生成

文字列キーの配列を渡すと、型付き辞書（`Record<K, Var>` または `Record<K, BoolVar>`）を返します。

```typescript
const items = ["laptop", "phone", "tablet"] as const;

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"] as const);
// perms.read, perms.write, perms.execute
```

### 2次元マトリクス・グリッドの生成

各次元のルールは共通で、数値を渡すと `Array`、キー配列を渡すと `Record` になります。

- `(rowsCount, colsCount)` $\rightarrow$ `Var[][]`（または `BoolVar[][]`）
- `(rowKeys, colKeys)` $\rightarrow$ `Record<R, Record<C, Var>>`（または `Record<R, Record<C, BoolVar>>`）
- `(rowsCount, colKeys)` $\rightarrow$ `Array<Record<C, Var>>`
- `(rowKeys, colsCount)` $\rightarrow$ `Record<R, Var[]>`

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB", "StoreC"];

// 1. キー配列 x キー配列 -> Record<string, Record<string, Var>>
const ship = m.continuous(factories, stores, { lb: 0 });
// ship.Tokyo.StoreA

// 2. 要素数 x 要素数 -> Var[][] (2次元配列)
const board = m.binary(8, 8, { prefix: "queen" });
// board[0][0], board.map(...)

// 3. キー配列 x 要素数 -> Record<string, Var[]>
const schedule = m.binary(factories, 7, { prefix: "open_day" });
// schedule.Tokyo[0]
```

---

## 変数オプション (`VarOptions`)

| オプション | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `lb` | `number` | `0` | 下限（Lower bound）。負値を許す場合は `-Infinity` を指定します。 |
| `ub` | `number` | `Infinity`（`binary` は `1`） | 上限（Upper bound）。 |
| `prefix` | `string` | `"x"`（`m.bool()` は `"p"`） | 無名スカラー変数や配列・2次元コンテナの変数名プレフィックス（例：`queen_0_0`）。 |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | メソッドから自動推論 | 数値変数のドメイン種別。 |
| `initialValue` | `number` | `undefined` | オプションの初期解ヒント（ウォームスタート）。求解結果の `variable.value` とは独立して保持されます。 |

### 上下限（`lb`, `ub`）の設計ポイント

- **負の値を許す場合**: 数値変数はデフォルトで非負です。差分や過不足など負の値をとり得る変数には `{ lb: -Infinity }` を明示してください。
- **有限の上下限で MIP を強化する**: 現実的な有限の `lb`・`ub` を与えると MIP の前処理が効きやすくなり、`m.indicator()` もタイトな Big-M 定数を自動導出できます。
- **CP ソルバーの必須条件**: Pumpkin のような有界整数の制約プログラミング（CP）ソルバーでは、すべての数値変数に有限の整数上下限が必須です。

---

## 初期値ヒント / ウォームスタート (`initialValue`)

反復計算などでモデルを再構築する際、一部または全部の数値変数に初期解ヒント（`initialValue`）を与えられます。
ファクトリメソッドのオプションで指定するか、`v.initialValue = ...` で直接代入してください。

```typescript
const prevValues: Record<string, number | null> = { trucks: 8, open_warehouse: 1 };

const m2 = new Model("RebuiltMIP");
const trucks2 = m2.integer("trucks", {
  lb: 0,
  ub: 15,
  initialValue: prevValues.trucks ?? undefined,
});
const openWarehouse2 = m2.binary("open_warehouse", {
  initialValue: prevValues.open_warehouse ?? undefined,
});
const extraCapacity = m2.continuous("extra_capacity", { lb: 0 }); // 部分的な指定も可能
```

### ヒントとしての扱い

`initialValue` はソルバーへの探索ヒントであり、変数の固定や制約追加ではありません。
求解前の `variable.value` は `null` のまま保たれます。
既存計画からの変更件数を目的関数で抑えたい場合は、[定式化パターン・Tips](./formulation-tips.md#minimal-perturbation) を参照してください。

### 検証と許容誤差 (`1e-6`)

指定した値は `[lb - 1e-6, ub + 1e-6]` 内の有限値である必要があります。
`"Integer"` および `"Binary"` 変数では、整数値から `1e-6` 以内であることも検証されます。
一部の変数のみの指定も可能ですが、全制約を満たす実行可能解を渡すと、MIP ソルバーは探索開始直後から暫定解（Incumbent：枝刈りの基準となる実行可能解）を得られます。

### 対応ソルバー

- **対応**: HiGHS はすべての数値変数に対応します。Pumpkin は有界な `Integer` / `Binary` 変数に対し、`solve()` と `check()` の双方で対応します。
- **非対応**: GLPK・Z3・ウォームスタート非対応のカスタムソルバーは、`initialValue` を黙って無視せず明示的なエラーをスローします。

---

## 求解後の値と被約費用の取得

`await m.solve()` または `await m.check()` の実行後、各変数の解は `variable.value` または `m.values` から取得できます。
`variable.value` の型は `Var` が `number | null`、`BoolVar` が `boolean | null` です。

HiGHS で連続線形計画（LP）モデルを解いた場合、`variable.reducedCost` から感度分析の結果を `number | null` で取得できます。
**被約費用（Reduced Cost）**は、上下限に張り付いている非基底変数の目的関数係数がどれだけ改善すれば、その変数が最適解に採用されるかを示す指標です。
未求解時、GLPK（制約の `dual` のみ対応）、または MIP・CP・SMT モデルでは `null` になります。

```typescript
await m.solve();

// スカラー変数の値（数値 / 真偽値）
console.log(`trucks: ${trucks.value}`);
console.log(`isAdmin: ${isAdmin.value}`);

// 1次元・2次元コンテナの要素アクセス
const packedItems = items.filter((it) => selected[it].value === 1);
console.log(`Tokyo -> StoreA: ${ship.Tokyo.StoreA.value}`);

// 変数名をキーとする ReadonlyMap からの取得 (ReadonlyMap<string, number | boolean>)
console.log(`trucks by name: ${m.values.get("trucks")}`);

// 被約費用 (LP の感度分析; number | null)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);
```

---

## 名前による変数の検索

登録済みの数値変数（`Var`）および命題論理変数（`BoolVar`）はすべて `m.variables`（`ReadonlyMap<string, Var | BoolVar>`）で参照できます。

```typescript
const v = m.variables.get("trucks");   // Var | BoolVar | undefined
const b = m.variables.get("isAdmin");  // Var | BoolVar | undefined
console.log("trucks の登録有無:", m.variables.has("trucks"));
console.log("総変数数:", m.variables.size);

// v.type ("Continuous" | "Integer" | "Binary" | "Boolean") で絞り込み可能:
if (v && v.type !== "Boolean") {
  console.log("上下限:", v.lb, v.ub);
}
```
