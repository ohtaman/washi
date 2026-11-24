# 矛盾診断 (`unsatCore`)・解の検証・デバッグ

モデルに解が見つからない（`"Infeasible"`）ときや、得られた解を本番で使う前に確認したいときのために、WaSHI には 4 つのツールが用意されています。

- **矛盾している制約の特定（`m.check()`）**: どの名前付き制約同士がぶつかっているかを調べます。
- **解の独立検証（`m.verify()`）**: 得られた解が上下限・整数条件・制約をすべて満たしているか確認します。
- **生成された数式の確認（`m.toLpString()`）**: CPLEX `.lp` 形式でモデルを出力し、係数・符号・制約名を目視確認します。
- **WebAssembly なしの単体テスト（`MockSolver`）**: CI などで固定の結果を即座に返してテストします。

---

## 矛盾している制約を特定する (`m.check()`)

`m.solve()` が `"Infeasible"` を返しただけでは、「解がない」ことは分かっても *どのルール同士が矛盾しているか* までは分かりません。
矛盾している制約を特定するには、有界整数・真偽値モデルなら `"pumpkin"`、連続変数（`Continuous`）や小数を含むモデルなら `"z3"` を指定して `m.check()` を呼び出します。

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model();
const x = m.continuous("reserve", { lb: 0 });

// 制約に名前を付けて登録
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("矛盾している制約:", m.conflicts);
  // 出力: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

`routine_operating_cost`（$x \ge 10$）は直接の矛盾に関係していないため除外され、互いにぶつかっている `minimum_regulatory_reserve`（$x \ge 100$）と `budget_ceiling`（$x \le 50$）だけが返ります。

> [!IMPORTANT]
> - **矛盾を調べるには `m.solve()` ではなく `m.check()` を使います**: `m.solve()` は目的関数を最適化するだけで、矛盾した制約のリストは返しません。`result.conflicts` / `m.conflicts`（別名 `result.unsatCore` / `m.unsatCore`）を取得するには `m.check()` を呼んでください。
> - **原因に含めたい制約には必ず名前を付けます**: 変数定義時の `lb`・`ub` には名前が付かないため、`conflicts` や `unsatCore` には表示されません。上下限も矛盾の原因として特定したい場合は、`m.constraint(expr`...`, "rule_name")` として名前付き制約でも登録してください。

### 診断用ソルバーの選び方

`m.solve()` が `"Infeasible"` になったあとは、モデルの性質に応じて次の 3 通りから選べます。

| | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **向いているモデル** | 有界整数・真偽値のみのモデル | `Continuous` 変数や小数を含むモデル | 追加 import なしで手軽に確認したいとき |
| **準備・依存関係** | 同梱（`@ohtaman/washi/solvers/pumpkin`） | オプション（`z3-solver`） | 標準搭載（`HiGHS`）/ オプション（`glpk.js`） |
| **ブラウザ HTTP ヘッダー** | 不要 | `COOP` / `COEP` ヘッダー必須 | 不要 |
| **結果が入るフィールド** | `unsatCore` と `conflicts` | `unsatCore` と `conflicts` | `conflicts` のみ（`unsatCore` は `undefined`） |
| **返される内容** | 同時に満たせない制約の集合 | 同時に満たせない制約の集合 | 緩めると解けるようになる制約の集合 |
| **単位スケールの影響** | 影響を受けない | 影響を受けない | 影響を受ける（数値が小さい制約ほど選ばれやすい） |

```typescript
// Pumpkin / Z3 を使う場合はファイルの先頭でインポートしてください:
// import "@ohtaman/washi/solvers/pumpkin";
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // 方法 1: 標準の HiGHS（追加 import 不要・数値スケールの影響あり）
  const diag = await m.check();
  console.error("緩和すると解ける制約:", diag.conflicts);

  // 方法 2: 同梱の Pumpkin（有界整数・真偽値向け / COOP・COEP 不要）
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // 方法 3: Z3（Continuous 変数・小数に対応 / 要 z3-solver）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> 人数（$\le 8$ 人）と予算（$\le 50{,}000$ 円）のように数値の桁数が大きく異なる制約が混ざっている場合、デフォルトの `m.check()`（HiGHS）は真の原因にかかわらず数値が小さい方の制約を選びやすくなります。桁数に左右されず原因を特定したい場合は、`pumpkin` または `z3` を使うか、制約の単位を揃えてください。

---

## 解を独立して検証する (`m.verify()`)

求解後（または `values` オプションで独自の解を渡して）に `m.verify()` を呼ぶと、変数の上下限・整数条件・線形制約・論理制約が許容誤差内で満たされているかを独立してチェックできます。

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
    feasibilityTolerance: 1e-6, // 上下限・線形制約の許容誤差
    integralityTolerance: 1e-6, // Integer / Binary 変数の整数からの許容誤差
    evaluateLogicalConstraints: true,
  });

  console.log("Valid:", report.valid);
  console.log("Complete:", report.complete);
  console.log("Max violation:", report.maxViolation);
  console.log("Summary:", report.summary);

  if (!report.valid) {
    console.warn("Violations detected:", report.violations);
  }
}
```

### `VerificationReport` の主なフィールド

| フィールド | 型 | 内容 |
| :--- | :--- | :--- |
| `valid` | `boolean` | `complete === true` かつ `uncheckedConstraints` と `violations` が空のとき `true`。 |
| `complete` | `boolean` | すべての変数と制約を評価できたとき `true`。 |
| `maxViolation` | `number` | 検証した上下限・整数条件・制約の中で最大の違反量。 |
| `violations` | `VerificationViolation[]` | 検出された違反の一覧（上下限・整数条件・線形/論理制約・欠損値など）。 |
| `violationsByName` | `Record<string, VerificationViolation[]>` | 変数名または制約名ごとにまとめた違反一覧。 |
| `uncheckedConstraints` | `string[]` | 評価できなかった制約名の配列。 |
| `missingVariables` | `string[]` | 値が `null` または `undefined` だった変数名の配列。 |
| `summary` | `VerificationSummary` | チェック済み数と総数の集計。 |

---

## LP 形式の数式を確認する (`m.toLpString()`)

係数や符号、制約名が意図通りか確認したいときは、`m.toLpString()` で標準的な CPLEX `.lp` 形式の文字列を出力できます。

```typescript
const m = new Model("DebugModel");
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`5 * ${x}`));
m.constraint(expr`2 * ${x} <= 15`, "resource_limit");

console.log(m.toLpString());
/*
Maximize
 obj: 5 x
Subject To
 resource_limit: 2 x <= 15
Bounds
 0 <= x <= 10
Generals
 x
End
*/
```

---

## WebAssembly なしで単体テストする (`MockSolver`)

モデルを構築・利用するアプリ側のロジックを単体テストするときは、`MockSolver` を使うと WebAssembly を読み込まずに固定の結果を即座に返せます。

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";

const mock = new MockSolver({
  status: "Optimal",
  objectiveValue: 420,
  values: { x: 10, y: 20 },
});

const m = new Model({ solver: mock });
const x = m.integer("x");
const y = m.integer("y");
m.objective(maximize(expr`10 * ${x} + 16 * ${y}`));

await m.solve();
console.log(m.objectiveValue); // 420
console.log(x.value, y.value); // 10, 20
```
