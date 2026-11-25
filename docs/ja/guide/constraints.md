# 制約条件 (`m.constraint` & `m.indicator`)

制約条件は、解が満たすべきルールを定義します。
WaSHI では、線形制約・論理制約・CP グローバル制約をすべて `m.constraint()` で登録します。

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## 代数的な線形制約 (`expr`)

タグ付きテンプレートリテラル `expr` を使うと、標準的な数式表記で線形等式や線形不等式を記述できます。

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

`m.constraint()` は登録された `Constraint`（論理式の場合は `BoolExpr`）、配列を渡した場合は登録結果の配列を返します。

### サポートされる比較演算子

- `<=`: 以下（上限）制約。
- `>=`: 以上（下限）制約。
- `==` または `=`: 等式制約。
- `<`, `>`, `!=`: 整数値の式専用の厳密不等式（`<`, `>`）・不一致（`!=`）制約（[離散比較演算子](#discrete-comparisons) 参照）。

### 配列による一括登録

制約の配列を `m.constraint([...])` に渡すと、一括で登録できます。
配列内に1つでも不正な要素があれば、何も登録されずにロールバックされます。

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 制約条件への名前付け

`m.constraint(c, name)` の第2引数には、一意でわかりやすい制約名を指定できます。

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 名前を付けるメリット

1. **LP 定式化の確認 (`m.toLpString()`)**: エクスポートされる CPLEX LP 文字列に制約名が残り、生成された定式化を確認・検証しやすくなります。
2. **矛盾診断 (`conflicts` / `unsatCore`)**: 制約同士が矛盾して解なしになった際、`m.check()` が矛盾の原因となっている制約の名前を返します。
3. **名前による参照 (`m.constraints.get()`)**: 求解後に名前から制約オブジェクトを取得し、`dual` や `slack` の値を確認できます。

---

## 総和・内積 (`sum` & `dot`) を使った制約

`expr` の中で直接 `sum(...)` や `dot(..., ...)` を使うことで、配列や辞書に対する線形制約を簡潔に書けます。

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

## 双対値（潜在価格）とスラックの取得

HiGHS で連続線形計画（LP）モデルまたは `m.relax()` による LP 緩和を解くと、各線形制約から感度分析に用いる2つのプロパティを取得できます（GLPK は `dual` のみを設定し、`slack` は `null` になります）。

- **`dual`（潜在価格 / シャドウプライス）**: 基底が変わらない範囲でその制約の右辺を1単位増加させたときの、最適目的関数値の限界変化量（符号付き）を表します。
- **`slack`（スラック）**: 最適解における `rhs - lhs` の値です（`<=` 制約では `>= 0`、`>=` 制約では `<= 0`、制約がぴったり成り立つときは `0`）。

いずれも型は `number | null` です。
未求解時、最適解が得られなかった場合、`m.solve()` で解いた MIP モデル、および CP・SMT モデルや論理制約では `null` になります。

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("潜在価格 (dual):", woodConstraint.dual);
console.log("スラック (slack):", woodConstraint.slack);
console.log("名前で取得した dual:", m.constraints.get("wood")?.dual); // number | null
console.log("登録済み制約の総数:", m.constraints.size);
```

---

## 条件付き制約 / インジケータ制約 (`m.indicator`)

バイナリ変数（`m.binary()`）が `activeValue`（デフォルトは `1`、または `0`）のときだけ線形制約を有効にしたい場合は、`m.indicator()` を使用します。
MIP では **Big-M 法** で条件付き制約を表現します。
たとえばバイナリ変数 $y \in \{0, 1\}$ に対する $a^\top x \le b + M(1 - y)$ は、$y = 1$ のとき $a^\top x \le b$ を課し、$y = 0$ のときは大きな定数 $M$ で制約を緩和します。

対象にできるのは `<=`・`>=`・`==` の線形制約のみです。離散の `!=`、非線形関数（`max`・`min`・`abs`・`at`）、および対象式の中で条件変数 `binVar` 自身を参照する記述はエラーになります。

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

### Big-M の自動導出と変数の上下限

`options.M` を省略すると、WaSHI は各変数の有限な上下限（`lb`, `ub`）から最小の安全な Big-M を自動計算します。

- `<=` 制約では、正の係数を持つ変数に有限の `ub`、負の係数を持つ変数に有限の `lb` が必要です。
- `>=` 制約では、正の係数を持つ変数に有限の `lb`、負の係数を持つ変数に有限の `ub` が必要です。
- `==` 制約では、`<=` 側と `>=` 側の Big-M をそれぞれ独立に導出し、`${name}_le` と `${name}_ge` の2つの制約を生成します。

必要な上下限が無限大のままの場合、`m.indicator()` はエラーをスローして有限の上下限または明示的な `options.M` の指定を求めます。

> [!NOTE]
> **MIP・CP・SMT 各ソルバーでの `m.indicator()` の挙動**: `options.M` を省略すると、`m.indicator()` はネイティブ処理用のメタデータを付与した Big-M 線形制約の配列（`Constraint[]`）を返します。
> HiGHS・GLPK・`m.toLpString()` はその Big-M 不等式をそのまま使い、Pumpkin と Z3 はメタデータを読み取って Big-M に伴う数値誤差や緩和の弱さを避けてネイティブに処理します。
> 返された各 `Constraint` オブジェクトを後から直接書き換えるとこのメタデータは解除され、編集後の線形制約が全ソルバーで使われます。

### 明示的な `M` の指定

`{ M: number }` を渡すと、自動導出された Big-M を明示的に上書きできます。

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 明示的に指定
});
```

> [!TIP]
> **過大な `M` を手動指定するより有限の上下限を設定する**: $M$ が小さすぎると本来の実行可能解を除外してしまい、大きすぎる $M$（`1e9` など）は LP 緩和を弱めるだけでなく数値安定性も損ねます。
> 各変数に現実的な `lb` と `ub` を設定し、WaSHI に最もタイトな Big-M を自動導出させてください。

---

## 命題論理・SMT 制約 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

WaSHI の論理演算子を使うと、`m.bool()` で作成した `BoolVar` と線形制約 `Constraint` を自在に組み合わせられます。
Pumpkin と Z3 は論理式をネイティブに処理し、HiGHS と GLPK は 0-1 MIP 制約へ自動線形化します。
Pumpkin や Z3 バックエンドを利用する場合は、`@ohtaman/washi/solvers/pumpkin` または `@ohtaman/washi/solvers/z3` をインポートして登録します。

> [!IMPORTANT]
> **ソルバーの前提条件**:
> - **Pumpkin**: すべての数値変数が有限の `lb`・`ub` を持つ `Integer` または `Binary` 変数である必要があります。
> - **Z3**: オプションの依存パッケージ `z3-solver` のインストール（`npm install z3-solver`）が必要です。ブラウザ環境では `SharedArrayBuffer` 用の `COOP`/`COEP` レスポンスヘッダーも必要になります。

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

// トップレベルの論理関数 (and, or, not, implies, xor):
m.constraint(and(or(isAdmin, hasMfa), not(xor(isAdmin, hasMfa))), "policy");
```

登録された制約（自動命名されたものを含む）はすべて `m.constraints`（`ReadonlyMap<string, Constraint | LogicalConstraint>`）に格納されており、`m.constraints.get(name)` で検索できます。
このうち論理制約および CP グローバル制約のエントリは `{ kind: "logical", name, expr, dual: null, slack: null }` の形式です。

### `m.indicator()` と `implies()` の使い分け

| 項目 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **条件側の変数** | 数値バイナリ変数 (`m.binary()`) | 命題変数 `BoolVar` (`m.bool()`)、`BoolOp`、または `Constraint` |
| **帰結側** | 線形制約 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp`、または線形制約 `Constraint` |
| **対応ソルバー** | 全ソルバー（HiGHS・GLPK は Big-M、`M` 省略時は Pumpkin・Z3 でネイティブ） | 全ソルバー（HiGHS・GLPK は 0-1 MIP へ自動線形化、Pumpkin・Z3 はネイティブ） |
| **主な用途** | 数値バイナリ変数を含む MIP 最適化 | 論理ルールの記述・SMT 充足可能性判定 |

> [!NOTE]
> **比較制約が否定される文脈（`not`・`xor` の引数、または `implies` の条件側）に書く場合**:
> - **整数式のみの場合**: $\neg(x \le 5)$ のような否定は HiGHS・GLPK で自動的に $x \ge 6$ に変換され、Pumpkin・Z3 ではネイティブに処理されます。
> - **`Continuous` 変数や小数を含む場合**: HiGHS・GLPK では連続値の厳密な `<`・`>` を閉じた線形不等式で表せないためエラーになります。`{ solver: "z3" }` を使うか、`m.bool()` で条件を表してください。

---

## 離散比較演算子 (`!=`, `<`, `>`) {#discrete-comparisons}

WaSHI では、`expr` テンプレート内および `Var`・`LinExpr`・`QuadExpr` の `.ne()`, `.lt()`, `.gt()` メソッドで離散比較演算子 `!=`, `<`, `>` を使えます。
対象は**整数値の式**（`Integer` / `Binary` 変数と安全な整数 `Number.isSafeInteger` の係数・定数のみ）に限定されます。

```typescript
const rankA = m.integer("rankA", { lb: 1, ub: 4 });
const rankB = m.integer("rankB", { lb: 1, ub: 4 });
const roomA = m.integer("roomA", { lb: 1, ub: 3 });
const roomB = m.integer("roomB", { lb: 1, ub: 3 });

m.constraint(expr`${rankA} < ${rankB}`, "strict_order"); // rankA - rankB <= -1 へ正規化
m.constraint(expr`${roomA} != ${roomB}`, "diff_room");   // Pumpkin/Z3 はネイティブ、HiGHS/GLPK は単一バイナリ変数 MIP
```

`Continuous` 変数や小数定数を含む式に `!=`, `<`, `>` を適用すると即座にエラーになります。
実数上の厳密不等式は開集合となり、たとえば $x < 5$ の下で $x$ を最大化しようとしても最適解（最大値）が存在しません。
そのため LP や MIP ソルバーは、最適解の存在を保証できる閉じた不等式（$\le$, $\ge$, $=$）を要求します。

---

## CP グローバル制約 (`distinct`, `disjoint`, `cumulative`, `allowed`)

WaSHI は、制約プログラミングの**グローバル制約**（複数の変数間の高水準な関係をひとまとめに表す述語）をバックエンド非依存の `BoolExpr` として提供しています。
いずれも `and`, `or`, `not`, `implies`, `xor` と自由に組み合わせられます。
区間スケジューリング・対称性除去・Pumpkin 向け定式化の詳細は、[制約プログラミング (CP) モデリングガイド](./constraint-programming.md) を参照してください。

| 制約 | 意味 | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | すべての値が互いに異なる（`!=`） | 全ペアに `!=` を MIP 展開 | ネイティブ `all_different` | ネイティブ `Distinct` |
| `disjoint(tasks)` | 各作業の区間 `[start, start + duration)` が互いに重ならない | 順序変数 + Big-M | ネイティブの重複禁止制約 | ペアごとの `Or` |
| `cumulative(tasks, capacity)` | どの時点でも合計負荷が `capacity` 以下 | 時間添字 MIP（5,000 ステップ / 25,000 変数超でエラー） | ネイティブ `cumulative` | 各作業の開始時点における負荷制約 |
| `allowed(vars, tuples)` | `vars` の値の組が `tuples` のいずれかの行に一致（`not(allowed(...))` で禁止） | タプル選択用のバイナリ変数 | ネイティブのテーブル制約 | タプルごとの `Or` / `And` |

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
> **スラック変数を用いたソフト制約化** や **対称性除去（Symmetry Breaking）** などの定式化テクニックについては、[定式化パターン・Tips](./formulation-tips.md#constraint-design) を参照してください。
