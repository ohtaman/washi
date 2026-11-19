# 決定変数とドメイン (`Variables`)

決定変数は、数理最適化や論理検証モデルにおいて求めたい未知数を表します。
WaSHI では、`Model` インスタンス上のドメイン別ファクトリメソッド（`m.continuous()`, `m.integer()`, `m.binary()`, `m.bool()`）を使って決定変数を定義します。

---

## 決定変数の種類

### 1. 連続変数 (`m.continuous`)
指定した範囲 `[lb, ub]` 内の任意の実数値をとる変数です。流量、重量、予算配分、投資比率などの連続量に使います：

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// [0, 1000] の範囲の単一連続変数
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. 整数変数 (`m.integer`)
指定した範囲 `[lb, ub]` 内の整数値のみをとる変数です。車両台数、生産個数、人員数など分割できない数量に使います：

```typescript
// [0, 15] の範囲の単一整数変数
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. 0-1 バイナリ変数 (`m.binary`)
数値として $\{0, 1\}$ のみをとる変数です（`lb = 0`, `ub = 1` に自動設定）。総和や目的関数のコスト項に含まれる Yes/No の意思決定に使います：

```typescript
// 単一のバイナリ変数 (lb = 0, ub = 1 に自動設定)
const openWarehouse = m.binary("open_warehouse");
```

### 4. 命題論理変数 (`m.bool`)
真偽値（`true` / `false`）をとる論理命題変数です。論理演算子（`and`, `or`, `not`, `implies`, `xor`）を用いた条件・ルール記述に使います：

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
| **ソルバーでの扱い** | HiGHS/GLPK で 0-1 MIP 変数として直接求解；Pumpkin/Z3 では `{0, 1}` 有界整数 | Pumpkin/Z3 ではネイティブ真偽値命題；HiGHS/GLPK では 0-1 MIP に自動線形化 |

> [!TIP]
> 個数・人数の合計（$\sum x_i \ge 3$）、目的関数のコスト項（$c_i x_i$）、または `m.indicator()` のトリガーとして算術式に組み込む場合は **`m.binary()`** を使用してください。数値係数を持たず、`implies()`・`and()`・`or()` などの論理演算で条件関係を記述する場合は **`m.bool()`** を使用します。

---

## 配列・辞書・2次元マトリクスの一括生成

各ファクトリメソッド（`continuous`, `integer`, `binary`, `bool`）は、要素数（`number`）やキー配列を渡すことで、1次元配列・型付き辞書・2次元マトリクスを1回の呼び出しで生成できます。

### 要素数（Count）による 1次元配列生成
数値を渡すと変数の配列を生成します：

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### キー配列による 1次元辞書の生成
文字列キーの配列を渡すと、型付き辞書 `Record<K, Var>`（または `Record<K, BoolVar>`）を返します：

```typescript
const items = ["laptop", "phone", "tablet"] as const;

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"] as const);
// perms.read, perms.write, perms.execute
```

### 2次元マトリクス・グリッドの生成
各次元について「数値を渡すと `Array`、キー配列を渡すと `Record`」という一貫したルールで2次元構造を生成できます：
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
| `lb` | `number` | `0` | 下限（Lower bound）。デフォルトは非負制約 `0`。負値を許す場合は `-Infinity` を指定します。 |
| `ub` | `number` | `Infinity`（`binary` は `1`） | 上限（Upper bound）。 |
| `prefix` | `string` | `"x"`（`m.bool()` は `"p"`） | 無名スカラー変数や配列・2次元コンテナの変数名プレフィックス（例：`queen_0_0`）。 |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | メソッドから自動推論 | 変数のドメイン種別。 |
| `initialValue` | `number` | `undefined` | オプションの主問題初期値ヒント（MIP ウォームスタート）。求解結果の `variable.value` とは独立して保持されます。 |

### 上下限（`lb`, `ub`）の設計ポイント

- **デフォルトは非負制約**: 数値変数はデフォルトで `lb: 0, ub: Infinity` になります。差分や過不足など負の値をとり得る変数には `{ lb: -Infinity }` を明示してください。
- **現実的な有限境界の指定を推奨**: 有限の上下限（`lb`, `ub`）を設定すると MIP の前処理（Presolve）が効きやすくなるほか、`m.indicator()` が安全でタイトな Big-M を自動導出できます。また **Pumpkin** のような有界整数 CP ソルバーでは有限の整数上下限が必須となります。

---

## 初期値ヒント / ウォームスタート (`initialValue`)

反復計算などでモデルを再構築する際、一部の数値変数または全変数に初期値ヒント（`initialValue`）を設定できます（`m.continuous`, `m.integer`, `m.binary` のオプション、または `v.initialValue = ...`）：

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

- **ヒントとしての扱い**: `initialValue` はソルバーへの初期解ヒント（HiGHS の `setSolution` や Pumpkin の `WarmStart` 分岐ヒューリスティクス）であり、変数の固定や制約追加ではありません。求解前の `variable.value` は `null` のまま保たれます。（*既存計画からの変更件数を抑えたい場合は [定式化パターン・Tips](./formulation-tips.md#minimal-perturbation) を参照してください。*）
- **検証と許容誤差 (`1e-6`)**: 境界 `[lb - 1e-6, ub + 1e-6]` 内の有限値であること（整数・バイナリ変数は整数から `1e-6` 以内）が検証されます。一部の変数のみの指定も可能ですが、すべての制約を満たす完全な実行可能解を渡すと、MIP ソルバーが初期ステップから暫定境界（Incumbent）を得られます。
- **対応ソルバー**: **HiGHS** と **Pumpkin**（`capabilities.supportsWarmStart === true`；Pumpkin は有界 `Integer` / `Binary` 変数に対して `solve()` と `check()` の双方で対応）がサポートしています。ウォームスタート非対応のソルバー（**GLPK**, **Z3**, または `supportsWarmStart: true` を持たないカスタムソルバー）では、`initialValue` を黙って無視せず明示的なエラーをスローします。

---

## 求解後の値と被約費用の取得

`await m.solve()` または `await m.check()` の実行後、`variable.value`（`Var` は `number | null`、`BoolVar` は `boolean | null`）で各変数の解を直接参照できるほか、変数名をキーとする `m.values` からも取得できます：

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

// 被約費用 (LP の感度分析)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);
```

---

## 名前による変数の検索

登録済みの数値変数（`Var`）および命題論理変数（`BoolVar`）はすべて `m.variables`（`ReadonlyMap<string, Var | BoolVar>`）で参照できます：

```typescript
const v = m.variables.get("trucks");   // Var | BoolVar | undefined
const b = m.variables.get("isAdmin");  // Var | BoolVar | undefined
console.log("trucks の登録有無:", m.variables.has("trucks"));
console.log("総変数数:", m.variables.size);

// v.type ("Continuous" | "Integer" | "Binary" | "Boolean") で絞り込み可能:
if (v && v.type !== "Boolean") {
  console.log("上下界:", v.lb, v.ub);
}
```
