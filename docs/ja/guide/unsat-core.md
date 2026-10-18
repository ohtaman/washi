# 矛盾診断 (`unsatCore`) と解の検証 (`validateSolution`)

実務で数理最適化やルールエンジンを構築していると、次の2つの課題に頻繁に直面します：
1. **なぜモデルが実行不可能（Infeasible）になったのか？** どのビジネスルール同士が衝突しているのか？
2. **ソルバーが返した解は本当にすべての制約を満たしているか？** 許容誤差・整数条件・LP定式化をどう検証するか？

WaSHI はこれらを解決するため、Z3 による **Unsat Core（充足不能コア）抽出**（`m.check()`）、**独立した解検証**（`m.validateSolution()`）、**LP 定式化出力**（`m.toLpString()`）、および **高速ユニットテスト用モック**（`MockSolver`）を備えています。

---

## 🔍 矛盾制約の診断 (`unsatCore` / `conflicts`)

モデルが実行不可能な場合、一般的な MIP ソルバーは単に `"Infeasible"` とだけ返し、どの制約が原因かは教えてくれません。
**`await m.check({ solver: "z3" })`** を呼び出すと、WaSHI は Z3 の `assertAndTrack` 機構を用いて **Unsatisfiable Core (`unsatCore`)**（互いに矛盾している名前付き制約の部分集合）を自動的に特定します：

```typescript
import { Model, expr } from "@ohtaman/washi";
// Z3 ソルバープラグインを登録
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });

const x = m.continuous("reserve", { lb: 0 });

// 互いに矛盾するビジネス要件を追加
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("矛盾している制約条件:");
  console.log(m.conflicts); // または result.conflicts / result.unsatCore / m.unsatCore
  // 出力: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

`routine_operating_cost`（$x \ge 10$）は矛盾の原因ではないため除外され、直接衝突している `minimum_regulatory_reserve`（$x \ge 100$）と `budget_ceiling`（$x \le 50$）だけが抽出されます。

> [!IMPORTANT]
> - **Unsat Core 抽出には `m.check({ solver: "z3" })` を使用します**: `m.solve()` は目的関数の最適化を実行するため、追跡付きの競合抽出（`conflicts` / `unsatCore`）は `m.check()` で行います。
> - **制約には名前を付けてください**: 変数の上下限（`lb`, `ub`）は前提ドメインとして扱われます。診断結果（`unsatCore`）にルール名を含めたい場合は、`m.constraint(expr`...`, "rule_name")` として名前付き制約を登録してください。

### 実践パターン: HiGHS で最適化し、Infeasible 時に Z3 で原因特定

WaSHI のモデルはソルバー非依存のため、普段は高速な **HiGHS** で最適化（`m.solve()`）を行い、`"Infeasible"` になったときだけ同一モデルを **Z3** の `m.check()` に渡して原因を特定できます：

```typescript
const status = await m.solve(); // HiGHS で高速に MIP 求解

if (status === "Infeasible") {
  const diag = await m.check({ solver: "z3" });
  console.error("以下の制約が衝突しています:", diag.conflicts);
}
```

---

## ✅ 解の独立検証 (`m.validateSolution()`)

求解後（またはカスタム解の適用後）に、得られた解が元のモデルの変数上下限・整数条件・線形制約・論理制約・目的関数値を許容誤差内で満たしているかを独立して検証できます：

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.validateSolution({
    absTol: 1e-6,         // 境界・制約・目的関数の絶対許容誤差
    relTol: 1e-6,         // 値の大きさに比例する相対許容誤差
    integralityTol: 1e-5, // Integer / Binary 変数の整数からの最大許容誤差
  });

  console.log("検証結果 (valid):", report.valid);
  console.log("最大境界違反:", report.maxBoundViolation);
  console.log("最大整数性違反:", report.maxIntegralityViolation);
  console.log("最大制約違反:", report.maxConstraintViolation);
  console.log("目的関数の乖離:", report.objectiveDiscrepancy);

  if (!report.valid) {
    console.warn("違反の詳細:", report.violations);
  }
}
```

### `SolutionValidationReport` の主なプロパティ

| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `valid` | `boolean` | 解が存在し、かつ違反（`violations`）が 0 件のとき `true`。 |
| `checkedSolveStatus` | `SolverStatus` | 検証時点でのモデルの `status`。 |
| `maxBoundViolation` | `number` | 全数値変数における上下限違反の最大値。 |
| `maxIntegralityViolation` | `number` | `"Integer"` / `"Binary"` 変数における最寄り整数からの最大距離。 |
| `maxConstraintViolation` | `number` | 全線形制約における残差違反の最大値。 |
| `objectiveDiscrepancy` | `number \| null` | 再計算した目的関数値と `m.objectiveValue` の絶対差。 |
| `violations` | `SolutionViolation[]` | 検出された違反の詳細リスト（`"missing_solution"`, `"bound"`, `"integrality"`, `"linear_constraint"`, `"logical_constraint"`, `"objective"`）。 |

---

## 📄 LP 定式化の出力・確認 (`m.toLpString()`)

係数や符号、あるいは `m.indicator()` によって自動展開された Big-M 制約を確認したい場合は、`m.toLpString()` で標準的な CPLEX / HiGHS `.lp` 形式の文字列を出力できます：

```typescript
const m = new Model("DebugModel");
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`5 * ${x}`));
m.constraint(expr`2 * ${x} <= 15`, "resource_limit");

console.log(m.toLpString());
/*
Minimize
  obj: - 5 x
Subject To
  resource_limit: 2 x <= 15
Bounds
  0 <= x <= 10
General
  x
End
*/
```

---

## 🧪 `MockSolver` によるアプリケーションの単体テスト

CI 環境などで WebAssembly をロードせずにアプリケーション側のモデル構築ロジックや結果処理ロジックを高速にテストしたい場合は、組み込みの `MockSolver`（`solver: "mock"`）を利用できます：

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";

const mock = new MockSolver({
  defaultResult: {
    status: "Optimal",
    objectiveValue: 420,
    values: { x: 10, y: 20 },
  },
});

const m = new Model({ solver: mock });
const x = m.integer("x");
const y = m.integer("y");
m.objective(maximize(expr`10 * ${x} + 16 * ${y}`));

await m.solve();
console.log(m.objectiveValue); // 420
console.log(x.value, y.value); // 10, 20
```
