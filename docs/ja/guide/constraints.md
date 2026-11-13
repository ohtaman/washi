# 制約条件 (`m.constraint` & `m.indicator`)

制約条件は、数理最適化や論理検証モデルの実行可能領域を定義します。
WaSHI では、線形算術制約と命題論理制約の両方を **`m.constraint()`** で登録します：

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## 代数的な線形制約 (`expr`)

`expr` タグ付きテンプレートリテラルを使うと、自然な数式表記で不等式や等式を記述できます：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 上限制約 (<=)
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");

// 下限制約 (>=)
m.constraint(expr`3 * ${x} + ${y} >= 20`, "min_demand");

// 等式制約 (==)
m.constraint(expr`${x} + ${y} == 30`, "exact_quota");
```

`m.constraint()` は登録された `Constraint`（論理式の場合は `BoolExpr`、配列を渡した場合はその配列）を返します。

### サポートされる比較演算子
- `<=`: 以下（上限）制約
- `>=`: 以上（下限）制約
- `==` または `=`: 等式制約

### 配列による一括登録
制約の配列を `m.constraint([...])` に渡すと、トランザクション的に一括登録できます：

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 制約条件への名前付け

`m.constraint(c, name)` の第2引数には、一意でわかりやすい制約名を指定できます：

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 名前を付けるメリット
1. **LP 定式化の確認 (`m.toLpString()`)**: エクスポートされる CPLEX LP 文字列に制約名が出力されるため、生成された式の確認が容易になります。
2. **矛盾診断 (`conflicts` / `unsatCore`)**: 制約同士が矛盾して解なしになった際、`m.check()`（標準 HiGHS の弾性緩和や Z3 の `unsatCore`）がどの名前付き制約同士が衝突しているかを返します。
3. **名前による参照 (`m.getConstraintByName()`)**: 求解後に名前から制約オブジェクトを取得し、潜在価格（`dual`）や余剰（`slack`）を確認できます。

---

## 総和・内積 (`sum` & `dot`) を使った集約制約

`expr` の中で直接 `sum(...)` や `dot(..., ...)` を使うことで、配列や辞書に対する線形制約を簡潔に書けます：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const items = ["A", "B", "C"] as const;
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// 選ぶ個数を 2 個以下に制限
m.constraint(expr`sum(${selected}) <= 2`, "max_items");

// 総重量を 25 以下に制限
m.constraint(expr`dot(${weights}, ${selected}) <= 25`, "capacity_limit");
```

---

## 条件付き制約 / インジケータ制約 (`m.indicator`)

バイナリ決定変数（`m.binary()`）が特定の値（`1` または `0`）のときだけ線形制約を有効にしたい場合は、`m.indicator()` を使用します：

```typescript
const useDiscount = m.binary("use_discount");
const cartTotal = m.continuous("cart_total", { lb: 0, ub: 10_000 });

// useDiscount == 1 のとき、cartTotal >= 100 を強制
// 変数の上下限から安全かつ最小の Big-M が自動導出されます
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  name: "min_spend_for_discount",
});
```

### Big-M の自動導出と変数境界

`options.M` を省略すると、WaSHI は各変数の有限な上下限（`lb`, `ub`）から安全で最小の Big-M を自動計算します：
- `<=` 制約では、正の係数を持つ変数に有限の `ub`、負の係数を持つ変数に有限の `lb` が必要です。
- `>=` 制約では、正の係数を持つ変数に有限の `lb`、負の係数を持つ変数に有限の `ub` が必要です。
- `==` 制約では、`<=` 側と `>=` 側の両方向について独立に Big-M が導出されます（`name_le` と `name_ge` を生成）。

必要な境界が無限大（`Infinity` / `-Infinity`）の場合は、`m.indicator()` がエラーをスローして有限な境界の設定または明示的な `options.M` の指定を促します。

### 明示的な `M` の指定

`{ M: number }` を渡すことで Big-M を明示的に上書きできます：

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 明示的に指定
});
```

> [!TIP]
> **過大な `M` の手動指定よりも有限な変数境界（`lb`, `ub`）の設定を推奨**: $M$ が小さすぎると本来の実行可能解を切り落としてしまい、逆に不必要に巨大な $M$（例: $10^9$）を与えると MIP ソルバーの数値安定性が低下します。各変数に現実的な上下限（`lb`, `ub`）を設定し、WaSHI に最小限の Big-M を自動導出させることを推奨します。

---

## 命題論理・SMT 制約 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

命題論理変数（`m.bool()`）と線形比較制約（`Constraint`）を論理演算子で組み合わせることができます。論理制約は **Z3** ソルバー（`@ohtaman/washi/solvers/z3`）ではネイティブに処理され、**HiGHS** や **GLPK** では自動的に 0-1 MIP 制約へ線形化されます：

```typescript
import { Model, expr, and, or, not, implies, xor } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");
const clearance = m.integer("clearance", { lb: 0, ub: 5 });

// BoolVar / BoolOp のメソッド構文:
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");

// 命題変数と線形算術制約の組み合わせ:
m.constraint(
  implies(isAdmin, expr`${clearance} >= 4`),
  "admin_clearance_level"
);

// 論理コンビネータ関数 (and, or, not, implies, xor):
m.constraint(and(or(isAdmin, hasMfa), not(xor(isAdmin, hasMfa))), "policy");
```

### `m.indicator()` と `implies()` の使い分け

| 項目 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **条件側の変数** | 数値バイナリ変数 (`m.binary()`) | 命題変数 `BoolVar` (`m.bool()`)、`BoolOp`、または `Constraint` |
| **帰結側の制約** | 線形制約 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp`、または線形制約 `Constraint` |
| **対応ソルバー** | **全 MIP / LP ソルバー**（HiGHS, GLPK, Z3）— Big-M 線形化 | **全ソルバー**（HiGHS, GLPK は 0-1 MIP 自動線形化、Z3 はネイティブ対応） |
| **主な用途** | バイナリ変数を含む数理最適化（`m.solve()`） | 論理ルールの記述・充足可能性判定（`m.check()`） |

> [!NOTE]
> **`implies()` の前提条件（Antecedent）に一般不等式を使う場合**: **Z3**（`solver: "z3"`）では、上記の `clearance` と `hasMfa` を使った ``implies(expr`${clearance} >= 4`, hasMfa)`` のように、一般の線形不等式を `implies(a, b)` の前提条件 `a` として直接扱えます。一方、MIP ソルバー（**HiGHS** / **GLPK**）で条件付き制約を扱う場合は、前提条件に `BoolVar`（`m.bool()`）を用いるか、バイナリ変数（`m.binary()`）をトリガーとする `m.indicator(binVar, constraint)` を使用してください。

---

## 双対変数（潜在価格）とスラックの取得

連続変数の線形計画問題（LP）では、求解後に各制約（`m.constraint()` の戻り値、または `m.getConstraintByName()` で取得）の潜在価格（`dual`）と余剰（`slack`）を取得できます：

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("潜在価格 (dual):", woodConstraint.dual);
console.log("余剰 (slack):", woodConstraint.slack);
console.log("線形制約の総数:", m.numConstrs);
```

名前付きの論理制約は `m.getLogicalConstraintByName(name)` で検索できます。

> [!TIP]
> **スラック変数を用いたソフト制約化**や**同一リソースの対称性除去（Symmetry Breaking）**などの定式化テクニックについては、[定式化パターン・Tips](./formulation-tips.md#constraint-design) を参照してください。
