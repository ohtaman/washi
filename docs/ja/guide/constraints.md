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
- `<`, `>`, `!=`: 離散の狭義不等式・非等式制約（整数値の式のみ。[離散比較演算子](#discrete-comparisons) 参照）

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
2. **矛盾診断 (`conflicts` / `unsatCore`)**: 制約同士が矛盾して解なしになった際、`m.check()`（標準 HiGHS の弾性緩和、同梱 Pumpkin の `unsatCore`、または Z3 の `unsatCore`）がどの名前付き制約同士が衝突しているかを返します。
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

## 双対変数（潜在価格）とスラックの取得

連続変数の線形計画問題（LP）では、求解後に各制約（`m.constraint()` の戻り値、または `m.getConstraintByName()` で取得）の潜在価格（`dual`）と余剰（`slack`）を取得できます：

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("潜在価格 (dual):", woodConstraint.dual);
console.log("余剰 (slack):", woodConstraint.slack);
console.log("線形制約の総数:", m.numConstrs);
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

> [!NOTE]
> **Pumpkin / Z3 でのネイティブ・インジケータ変換**: `options.M` を省略した場合でも、`m.indicator()` は従来どおり Big-M 線形化された `Constraint[]` 行を返します（そのため `m.toLpString()` や HiGHS / GLPK の出力は完全な後方互換性を保ちます）が、内部メタデータを付与することで **Pumpkin**（`implied_by`）および **Z3**（`ctx.Implies`）では大きな Big-M 定数による数値劣化やオーバーフローを伴わないネイティブ条件制約として変換されます。返却された `Constraint` 行を直接書き換えた場合はメタデータが自動で破棄され、変更後の制約式がそのまま適用されます。

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

命題論理変数（`m.bool()`）と線形比較制約（`Constraint`）を論理演算子で組み合わせることができます。論理制約は **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`、有界整数・真偽値モデル向け）および **Z3**（`@ohtaman/washi/solvers/z3`）ではネイティブに処理され、**HiGHS** や **GLPK** では自動的に 0-1 MIP 制約へ線形化されます：

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

名前付きの論理制約は `m.getLogicalConstraintByName(name)` で検索できます。

### `m.indicator()` と `implies()` の使い分け

| 項目 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **条件側の変数** | 数値バイナリ変数 (`m.binary()`) | 命題変数 `BoolVar` (`m.bool()`)、`BoolOp`、または `Constraint` |
| **帰結側の制約** | 線形制約 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp`、または線形制約 `Constraint` |
| **対応ソルバー** | **全 MIP / LP ソルバー**（HiGHS, GLPK は Big-M、`M` 省略時は Pumpkin / Z3 でネイティブ変換） | **全ソルバー**（HiGHS, GLPK は 0-1 MIP 自動線形化、Pumpkin, Z3 はネイティブ対応） |
| **主な用途** | バイナリ変数を含む数理最適化（`m.solve()`） | 論理ルールの記述・充足可能性判定（`m.check()`） |

> [!NOTE]
> **否定側に現れる比較制約（`implies` の前提・`not`・`xor` など）**: 参照される変数がすべて `Integer` または `Binary` で整数係数・整数右辺を持つ線形比較制約（Big-M インジケータに必要な有限境界を備えるもの。上記の `clearance` と `hasMfa` を使った ``implies(expr`${clearance} >= 4`, hasMfa)`` など）は、**HiGHS** や **GLPK** でも $\pm 1$ シフト（$\neg(a^\top x \le b) \iff a^\top x \ge b + 1$、$==$ は $\le b - 1$ または $\ge b + 1$）によって厳密に MIP 線形化され、**Pumpkin** や **Z3** ではネイティブに処理されます。一方、`Continuous` 変数や非整数の係数・閾値を含む比較制約が否定側に現れた場合、厳密不等式の否定が開半空間となるため MIP ソルバー（HiGHS / GLPK での `solve()` / `check()`）ではエラーを送出します—`{ solver: "z3" }` を利用するか、許容幅 `eps` を用いた ``or(expr`... >= ... + eps`, ...)`` や `m.bool()` で明示的に記述してください。

---

## 離散比較演算子 (`!=`, `<`, `>`) {#discrete-comparisons}

WaSHI では、`expr` テンプレート内（および `Var`, `LinExpr`, `QuadExpr` 上の `.ne()`, `.lt()`, `.gt()` メソッド）で離散比較演算子 `!=`, `<`, `>` を利用できます。これらは**整数値の式**（`Integer` / `Binary` 変数と整数係数・整数定数のみ）に限定されます：

```typescript
const rankA = m.integer("rankA", { lb: 1, ub: 4 });
const rankB = m.integer("rankB", { lb: 1, ub: 4 });
const roomA = m.integer("roomA", { lb: 1, ub: 3 });
const roomB = m.integer("roomB", { lb: 1, ub: 3 });

m.constraint(expr`${rankA} < ${rankB}`, "strict_order"); // rankA - rankB <= -1 へ正規化
m.constraint(expr`${roomA} != ${roomB}`, "diff_room");   // Pumpkin: not_equals, Z3: neq, MIP: 単一バイナリ変数で線形化
```

`Continuous` 変数や小数定数を含む式に `!=`, `<`, `>` を適用すると、連続領域で開集合となるため即座にエラーが送出されます。

---

## CP グローバル制約 (`distinct`, `disjoint`, `cumulative`, `allowed`)

`and` / `or` / `not` / `implies` / `xor` と合成可能な `BoolExpr` を返すグローバル制約を提供しています。区間スケジューリング・対称性除去・**Pumpkin** 向け定式化の詳細は [制約プログラミング (CP) モデリングガイド](./constraint-programming.md) を参照してください。

| グローバル制約 | 意味論 | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | 整数値式・1D/2D コンテナ全要素の pairwise 相異（`AllDifferent`） | pairwise `!=` MIP | `all_different` | `ctx.Distinct` |
| `disjoint(tasks)` | 単一機械上の非重複区間 `[start, start + duration)`（`NoOverlap` / `Disjunctive`、整数 `duration >= 0`、duration=0 は境界のみ許容） | pairwise 順序バイナリ + Big-M | `disjunctive_strict`（Vilím エッジ発見） | pairwise `Or` 選言 |
| `cumulative(tasks, capacity)` | 全時刻で総リソース要求量 $\le$ `capacity`（整数 `duration >= 0`, `demand >= 0`） | 時間離散化 MIP（スパン 5,000 / パルス変数 25,000 超で `{ solver: "pumpkin" }` 推奨エラー） | ネイティブ `cumulative`（タイムテーブル伝播） | 開始時刻イベント負荷表明 |
| `allowed(vars, tuples)` | タプル集合への所属制約（`Table` / `AllowedAssignments`、禁止タプルは `not(allowed(...))`） | タプル選択バイナリ（2値変数の否定は 0-バイナリ・カット） | `table` / `negative_table` | タプル選言・連言 |

```typescript
import { Model, expr, distinct, disjoint, cumulative, allowed, not, minimize } from "@ohtaman/washi";

const m = new Model("ScheduleAndAssign");
const s = m.integer(2, { lb: 0, ub: 10, prefix: "s" });
const room = m.integer(2, { lb: 1, ub: 2, prefix: "room" });

m.constraint(distinct(room), "unique_rooms");
m.constraint(disjoint([{ start: s[0], duration: 4 }, { start: s[1], duration: 3 }]), "machine_1");
m.constraint(not(allowed([room[0], room[1]], [[1, 2]])), "forbid_1_2");
m.constraint(cumulative([{ start: s[0], duration: 4, demand: 1 }, { start: s[1], duration: 3, demand: 1 }], 2), "workers");
m.objective(minimize(expr`${s[0]} + ${s[1]}`));
```

> [!TIP]
> **スラック変数を用いたソフト制約化**や**同一リソースの対称性除去（Symmetry Breaking）**などの定式化テクニックについては、[定式化パターン・Tips](./formulation-tips.md#constraint-design) を参照してください。
