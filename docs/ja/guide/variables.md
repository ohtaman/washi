# 決定変数とドメイン (`Variables`)

決定変数は、数理最適化モデルにおいて求めたい未知数を表します。
WaSHI では、`Model` インスタンス上のドメイン別ファクトリメソッド（`m.continuous()`, `m.integer()`, `m.binary()`, `m.bool()`）を使って決定変数を定義します。

---

## 決定変数の種類

### 1. 連続変数 (`m.continuous`)
指定した範囲 `[lb, ub]` 内の任意の実数値をとることができます。流量、重量、予算配分、投資比率などに適しています：

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// [0, 1000] の範囲の単一連続変数
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. 整数変数 (`m.integer`)
整数値のみをとる変数です。トラック台数、生産個数、人員数など分割できない数量に適しています：

```typescript
// [0, 15] の範囲の単一整数変数
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. 0-1 バイナリ変数 (`m.binary`)
数値として $\{0, 1\}$ のみをとる変数です。拠点開設の有無やアイテム選択など、MIP における Yes/No の意思決定に使います：

```typescript
// 単一のバイナリ変数 (lb=0, ub=1 に自動設定)
const openWarehouse = m.binary("open_warehouse");
```

### 4. 命題論理変数 (`m.bool`)
Z3 を用いた SMT / SAT モデリング向けの純粋な真偽値（`true` / `false`）命題変数です：

```typescript
// 単一の命題論理変数
const isNight = m.bool("isNight");
const alarmTriggered = m.bool("alarmTriggered");

// 論理演算子: and, or, not, implies, xor
m.constraint(alarmTriggered.implies(isNight), "alarm_policy");
```

### 💡 半連続変数（Semi-Continuous）のモデリング
半連続変数は $\{0\} \cup [L, U]$ の値（0、または正の下限 $L$ から上限 $U$ の間）をとる変数で、最小ロットサイズのある生産量などで使われます。

連続変数とバイナリ変数を組み合わせ、連結制約（$L \cdot b \le x \le U \cdot b$）を課すことで簡潔に表現できます：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// isActive === 0 なら batch = 0、isActive === 1 なら batch は [10, 100] の範囲
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

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
- `(rowKeys, colKeys)` $\rightarrow$ `Record<R, Record<C, Var>>`
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
| `lb` | `number` | `0` | 下限（Lower bound）。デフォルトは非負制約 `0`。 |
| `ub` | `number` | `Infinity`（`binary` は `1`） | 上限（Upper bound）。 |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | メソッドから自動推論 | 変数のドメイン種別。 |
| `initialValue` | `number` | `undefined` | オプションの主問題初期値ヒント（MIP ウォームスタート）。求解結果の `variable.value` とは独立して保持されます。 |

---

## 初期値ヒント / ウォームスタート (`initialValue`)

反復計算などでモデルを再構築する際、一部の数値変数または全変数に初期値ヒント（`initialValue`）を設定できます：

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

- **ヒントとしての扱い**: `initialValue` はソルバーへの初期解ヒント（HiGHS の `setSolution`）であり、変数の固定や制約追加ではありません。求解前の `variable.value` は `null` のまま保たれます。
- **検証と許容誤差 (`1e-6`)**: 境界 `[lb - 1e-6, ub + 1e-6]` 内の有限値であること（整数・バイナリ変数は整数から `1e-6` 以内）が検証されます。
- **対応ソルバー**: **HiGHS**（`capabilities.supportsWarmStart === true`）がサポートしています。ウォームスタート非対応のソルバー（GLPK, Z3 など）では、`initialValue` を黙って無視せず明示的なエラーを投げます。

---

## 求解後の値と被約費用の取得

`await m.solve()` または `await m.check()` の実行後、`variable.value` または一括取得メソッド `m.getValues()` で変数の解（`solve()` では最適解または暫定解、`check()` では制約を充足する割当）を取り出せます：

```typescript
await m.solve();

// 単一変数の値
console.log(`trucks: ${trucks.value}`);

// 被約費用 (LP の感度分析: 境界上にある変数が基底に入るために必要な目的関数係数の改善量)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);

// 1次元・2次元コレクションの一括抽出 (Var / BoolVar の両方に対応)
const selectedValues = m.getValues(selected);
// { laptop: 1, phone: 0, tablet: 1 }

const flowValues = m.getValues(ship);
// { Tokyo: { StoreA: 50, ... }, Osaka: { ... } }
```

---

## 名前による変数の検索

登録済みの変数を名前から取得したり、モデル内の数値変数の総数を確認できます：

```typescript
const v = m.getVarByName("trucks");           // Var | undefined
const b = m.getBoolVarByName("isNight");      // BoolVar | undefined
console.log("数値変数の総数:", m.numVars);
```
