# 制約条件 (`m.constraint` & `m.indicator`)

制約条件は、解が満たすべきルールを定義します。
WaSHI では、線形制約と論理ルールの両方を **`m.constraint()`** で登録します：

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
- `<`, `>`, `!=`: 厳密不等式・非等式制約（整数値の式のみ。[離散比較演算子](#discrete-comparisons) 参照）

### 配列による一括登録
制約の配列を `m.constraint([...])` に渡すと、まとめて一括登録できます（1つでも不正な要素があれば何も登録されません）：

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
3. **名前による参照 (`m.constraints.get()`)**: 求解後に名前から制約オブジェクトを取得し、潜在価格（`dual`）や余剰（`slack`）を確認できます。

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

連続変数の線形計画問題（LP）では、求解後に各制約（`m.constraint()` の戻り値、または `m.constraints.get()` で取得）の潜在価格（`dual`）と余剰（`slack`）を取得できます：

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("潜在価格 (dual):", woodConstraint.dual);
console.log("余剰 (slack):", woodConstraint.slack);
console.log("名前検索の dual:", m.constraints.get("wood")?.dual); // number | null（MIP / CP / 論理制約は null）
console.log("登録済み制約の総数:", m.constraints.size);
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
> **Pumpkin / Z3 でのネイティブ対応**: `options.M` を省略しても、`HiGHS`・`GLPK`・`m.toLpString()` 向けには従来どおり Big-M で動作し、**Pumpkin** と **Z3** では Big-M の数値誤差なしでネイティブに処理されます。返された制約を後から直接書き換えた場合は、変更後の式がそのまま使われます。

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

名前付きの制約は、線形制約（`Constraint`）と論理/CP制約（`LogicalConstraint`: `{ kind: "logical", name, expr, dual: null, slack: null }`）のどちらも `m.constraints`（`ReadonlyMap<string, Constraint | LogicalConstraint>`）に統一格納されており、`m.constraints.get(name)` で検索できます。

### `m.indicator()` と `implies()` の使い分け

| 項目 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **条件側の変数** | 数値バイナリ変数 (`m.binary()`) | 命題変数 `BoolVar` (`m.bool()`)、`BoolOp`、または `Constraint` |
| **帰結側の制約** | 線形制約 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp`、または線形制約 `Constraint` |
| **対応ソルバー** | **全 MIP / LP ソルバー**（HiGHS, GLPK は Big-M、`M` 省略時は Pumpkin / Z3 でネイティブ変換） | **全ソルバー**（HiGHS, GLPK は 0-1 MIP 自動線形化、Pumpkin, Z3 はネイティブ対応） |
| **主な用途** | バイナリ変数を含む数理最適化（`m.solve()`） | 論理ルールの記述・充足可能性判定（`m.check()`） |

> [!NOTE]
> **比較制約を否定側（`not`・`xor`・`implies` の条件側）に書く場合**:
> - **整数式のみの場合**: $\neg(x \le 5)$ のような否定は、`HiGHS`/`GLPK` では自動的に $x \ge 6$ に変換され、`Pumpkin`/`Z3` ではネイティブに処理されます。
> - **`Continuous` 変数や小数を含む場合**: `HiGHS`/`GLPK` では連続値の `<` / `>` を表せないためエラーになります。`{ solver: "z3" }` を使うか、`m.bool()` で条件を表してください。

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

| 制約 | 意味 | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | すべての値が互いに異なる（`!=`） | 全ペアの `!=` MIP | ネイティブ `all_different` | ネイティブ `Distinct` |
| `disjoint(tasks)` | 作業 `[start, start + duration)` が重ならない | 順序変数 + Big-M | ネイティブ重複禁止 | ペアごとの `Or` |
| `cumulative(tasks, capacity)` | どの時点でも合計負荷が `capacity` 以下 | 時間離散化 MIP（5,000 ステップ / 25,000 変数超でエラー） | ネイティブ `cumulative` | 開始時点の負荷記述 |
| `allowed(vars, tuples)` | 値が `tuples` のいずれかに一致（`not(allowed(...))` で禁止） | 選択バイナリ変数 | ネイティブテーブル | タプルごとの `Or` / `And` |

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
