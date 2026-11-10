# 制約条件 (`m.constraint` & `m.indicator`)

制約条件は、数理最適化や論理検証モデルの実行可能領域を定義します。
WaSHI では、線形制約条件と命題論理（SMT）制約の両方を **`m.constraint()`** で登録します：

```typescript
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ 代数的な線形制約 (`expr`)

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

### サポートされる比較演算子
- `<=`: 以下（上限）制約
- `>=`: 以上（下限）制約
- `==` または `=`: 等式制約

### 配列による一括登録
制約の配列を `m.constraint([...])` に渡して、トランザクション的に一括登録することも可能です：

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 🏷️ 制約条件への名前付け

`m.constraint(c, name)` の第2引数には、一意でわかりやすい制約名を指定できます：

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 名前を付けるメリット
1. **LP 定式化の確認 (`m.toLpString()`)**: エクスポートされる CPLEX LP 文字列に制約名がそのまま出力されるため、生成された式のデバッグが容易になります。
2. **矛盾診断 (`conflicts` / `unsatCore`)**: 制約同士が矛盾して解なしになった際、Z3 の `m.check()` がどの名前付き制約同士が衝突しているかを返します。
3. **名前による参照 (`m.getConstraintByName()`)**: 求解後に名前から制約オブジェクトを取り出し、潜在価格（`dual`）や余剰（`slack`）を確認できます。

---

## 🔁 総和 (`sum`) を使った集約制約

`expr` の中に `sum()` や `dot()` を埋め込むことで、配列や辞書に対する線形制約を簡潔に記述できます：

```typescript
import { Model, sum, expr } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// 総重量を 25 以下に制限
m.constraint(
  expr`${sum(items, (i) => selected[i].mul(weights[i]))} <= 25`,
  "capacity_limit"
);
```

---

## 🎯 条件付き制約 / インジケータ制約 (`m.indicator`)

バイナリ決定変数が特定の値（`1` または `0`）のときだけ線形制約を有効にしたい場合は、`m.indicator()` を使用します：

```typescript
const useDiscount = m.binary("use_discount");
const cartTotal = m.continuous("cart_total", { lb: 0, ub: 10_000 });

// useDiscount == 1 のとき、cartTotal >= 100 を強制
// 変数の上下限から安全かつタイトな Big-M が自動導出されます
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  name: "min_spend_for_discount",
});
```

### Big-M の自動導出と変数境界

`options.M` を省略すると、WaSHI は各変数の有限な上下限（`lb`, `ub`）から安全で最小の Big-M を自動計算します：
- `<=` 制約では、正の係数を持つ変数に有限の `ub`、負の係数を持つ変数に有限の `lb` が必要です。
- `>=` 制約では、正の係数を持つ変数に有限の `lb`、負の係数を持つ変数に有限の `ub` が必要です。
- `==` 制約では、`<=` 側と `>=` 側の両方向について独立に Big-M が導出されます。

必要な境界が無限大（`Infinity` / `-Infinity`）の場合は、`m.indicator()` がエラーを投げて有限な境界の設定または明示的な `options.M` の指定を促します。

### 明示的な Big-M 指定と数値安定性

`{ M: number }` を渡すことで Big-M を明示的に上書きできます：

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 明示的に指定
});
```

> [!TIP]
> **数値安定性と正確性**:
> $M$ が小さすぎると本来の実行可能解を切り落としてしまい、逆に不必要に巨大な $M$（例: $10^9$）を与えると MIP ソルバーの数値誤差や計算速度低下を招きます。各変数に現実的な上下限（`lb`, `ub`）を設定し、WaSHI に最小限の Big-M を自動導出させることを推奨します。

---

## 🧠 命題論理・SMT 制約 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

**Z3** ソルバープラグイン（`@ohtaman/washi/solvers/z3`）を使用すると、命題論理変数（`m.bool()`）と線形比較制約（`Constraint`）を論理演算子で自由に組み合わせることができます：

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
| **主な用途** | 目的関数を伴う数理最適化（`m.solve()`） | ルール検証・ポリシー検証・充足可能性判定（`m.check()`） |

> [!NOTE]
> **`implies()` の前提条件（Antecedent）に一般不等式を使う場合**: **Z3**（`solver: "z3"`）では、``expr`${luxLevel} <= 50`.implies(isNight)`` のように一般の線形不等式を `implies(a, b)` の前提条件 `a` として直接扱えます。一方、MIP ソルバー（**HiGHS** / **GLPK**）で条件付き制約を扱う場合は、前提条件に `BoolVar`（`m.bool()`）を用いるか、バイナリ変数（`m.binary()`）をトリガーとする `m.indicator(binVar, constraint)` を使用してください。

---

## 🪞 対称性除去制約（Symmetry Breaking）

同一スペックのトラック・ビン（箱）・並列機械が $K$ 台あるモデルでは、どのトラックを「1号車」「2号車」と呼ぶかを入れ替えた $K!$ 通りの等価な解が存在します。この対称性を放置すると、MIP ソルバーが分枝限定法の探索木で同じ目的関数値を持つ鏡像の部分木を何度も探索してしまい、最適性の証明が極端に遅くなります。

同一リソースには「番号の若いリソースから順番に使用する（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$）」という順序付け制約を追加することで、解の質を一切損なわずに探索空間を劇的に削減できます：

```typescript
const numTrucks = 4;
const truckUsed = m.binary(numTrucks, { prefix: "truck_used" });

// トラック k が使われているときだけトラック k+1 の使用を許可する (u_0 >= u_1 >= u_2 >= u_3)
for (let k = 0; k < numTrucks - 1; k++) {
  m.constraint(
    expr`${truckUsed[k]} >= ${truckUsed[k + 1]}`,
    `symmetry_truck_${k}`
  );
}
```

---

## ⚖️ ハード制約 vs ソフト制約（スラック変数による緩和）

シフトスケジューリングや生産計画などの実務問題では、すべての業務ルールを絶対条件（**ハード制約**）として記述すると、繁忙期や欠員時に条件を1つでも満たせなくなった瞬間に解なし（`"Infeasible"`）となってしまいます。

絶対に破れない物理的・法的な制約（ハード制約）と、可能な限り守りたい目標（**ソフト制約**）を切り分け、ソフト制約には非負の不足・超過スラック変数（$s \ge 0$）を導入して目的関数でペナルティを課すのが実務の定石です：

| 制約の種類 | ハード制約 | ソフト制約（緩和後, $s \ge 0$） | 目的関数へのペナルティ項（最小化） |
| :--- | :--- | :--- | :--- |
| **下限制約** | $\text{lhs} \ge b$ | $\text{lhs} + s_{\text{short}} \ge b$ | $+ W \cdot s_{\text{short}}$ |
| **上限制約** | $\text{lhs} \le b$ | $\text{lhs} - s_{\text{excess}} \le b$ | $+ W \cdot s_{\text{excess}}$ |
| **目標等式** | $\text{lhs} = b$ | $\text{lhs} + s_{\text{short}} - s_{\text{excess}} = b$ | $+ W_1 \cdot s_{\text{short}} + W_2 \cdot s_{\text{excess}}$ |

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("ElasticShiftCoverage");

const assignedStaff = m.integer("assignedStaff", { lb: 0, ub: 4 }); // 当日の出勤可能上限は 4 名
const shortage = m.continuous("shortage", { lb: 0 });               // 不足人数を表す非負スラック変数 (s >= 0)

// ソフト制約: 目標は 5 名だが、不可能な場合は shortage > 0 を許容して解を返す
m.constraint(expr`${assignedStaff} + ${shortage} >= 5`, "target_5_staff");

// 通常人件費 ($100) よりも十分大きいペナルティ重み ($1,000) を不足人数に課す
m.objective(minimize(expr`100 * ${assignedStaff} + 1000 * ${shortage}`));

await m.solve();
console.log("配置人数:", assignedStaff.value); // 4
console.log("不足人数:", shortage.value);      // 1 (Infeasible にならず最善の妥協解と不足箇所が分かる)
```

> **実務の勘所 — ペナルティ重み $W$ の設計**: 重み $W$ は通常のコスト係数より十分大きく（例：$10\sim 1{,}000$ 倍）設定しますが、$10^{12}$ のような極端に巨大な値は避けてください。モデル内の最大係数と最小係数の比（スケーリング比）を $10^5\sim 10^6$ 以内に収めることで、ソルバーの浮動小数点数値安定性を高く保てます。

---

## 📐 双対変数（潜在価格）とスラックの取得

連続変数の線形計画問題（LP）では、求解後に各制約（`m.constraint()` の戻り値、または `m.getConstraintByName()` で取得）の潜在価格（`dual`）と余剰（`slack`）を取得できます：

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("潜在価格 (dual):", woodConstraint.dual);
console.log("余剰 (slack):", woodConstraint.slack);
console.log("線形制約の総数:", m.numConstrs);
```

名前付きの論理制約は `m.getLogicalConstraintByName(name)` で検索できます。
