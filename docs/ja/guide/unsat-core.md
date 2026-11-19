# 矛盾診断 (`unsatCore`)・解の検証・デバッグ

実務で数理最適化やルールエンジンを構築していると、実行不可能なモデルの原因特定、得られた解の独立検証、さらに定式化の確認や単体テストが必要になります。

WaSHI はこれらに対応するため、以下の診断・検証・デバッグツールを標準で備えています：
- **矛盾診断（`m.check()`）**: 標準 HiGHS の弾性スラック緩和、同梱 Pumpkin の `unsatCore`、または Z3 の `unsatCore` により衝突している制約を特定します。
- **解の検証と LP 定式化出力（`m.verify()`, `m.toLpString()`）**: 変数境界・整数条件・制約の充足を独立検証し、生成された CPLEX `.lp` 文字列を目視確認できます。
- **高速な単体テスト（`MockSolver`）**: WebAssembly をロードせずにアプリ側のモデル構築・結果処理ロジックを CI で高速テストできます。

---

## 矛盾制約の診断 (`unsatCore` / `conflicts`)

通常の最適化実行（`m.solve()`）が **`"Infeasible"`** を返しただけでは、すべての制約を同時に満たす解が存在しないことは分かっても、*どの*ルール同士が衝突しているかまでは分かりません。
**`await m.check({ solver: "pumpkin" })`**（有界整数・真偽値モデル向け、`COOP`/`COEP` ヘッダーや外部依存なし）または **`await m.check({ solver: "z3" })`**（`Continuous` 変数や実数を含むモデル向け）を呼び出すと、WaSHI は **Unsatisfiable Core (`unsatCore`)**（互いに矛盾している名前付き制約の部分集合）を自動的に特定します：

```typescript
import { Model, expr } from "@ohtaman/washi";
// Z3 ソルバープラグインを登録（Continuous / 実数を含む SMT モデル向け）
import "@ohtaman/washi/solvers/z3";

const m = new Model();

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
> - **Unsat Core 抽出には `m.check({ solver: "pumpkin" })` または `m.check({ solver: "z3" })` を使用します**: `m.solve()` は目的関数の最適化を実行するため、仮定追跡付きの競合抽出（`conflicts` / `unsatCore`）は `m.check()` で行います。
> - **制約には名前を付けてください**: 変数の上下限（`lb`, `ub`）は前提ドメインとして扱われます。診断結果（`unsatCore`）にルール名を含めたい場合は、`m.constraint(expr`...`, "rule_name")` として名前付き制約を登録してください。

### 実践パターン: HiGHS・Pumpkin・Z3 による実行不能原因の特定

WaSHI のモデルはソルバー非依存のため、実行不能（`"Infeasible"`）となった場合に 3 通りの診断方法を選択できます：
1. **標準の HiGHS / GLPK**: `await m.check()` が単一 solve の弾性スラック緩和（$\min \sum s_i$）を用いて緩和が必要な制約（`diag.conflicts`）を特定します（追加 import 不要）。
2. **同梱 Pumpkin CP/LCG ソルバー**: `await m.check({ solver: "pumpkin" })`（要 `import "@ohtaman/washi/solvers/pumpkin"`）が、**追加依存なし・ブラウザの `COOP` / `COEP` ヘッダー不要**で有界整数・真偽値モデルのスケール不変な `unsatCore` / `conflicts` を抽出します。
3. **Z3 SMT ソルバー**: `await m.check({ solver: "z3" })` が SMT 制約追跡を用いて、`Continuous` 変数や小数を含むモデルでも厳密な矛盾制約核（`diag.unsatCore` / `diag.conflicts`）を抽出します。

```typescript
const status = await m.solve(); // デフォルトの HiGHS で高速に MIP 求解

if (status === "Infeasible") {
  // 方法 1: 標準 HiGHS による単一 solve 弾性診断
  const diag = await m.check();
  console.error("以下の制約が衝突しています:", diag.conflicts);

  // 方法 2: 同梱 Pumpkin による COOP/COEP 不要の Unsat Core 診断（有界整数・真偽値モデル向け・要 import "@ohtaman/washi/solvers/pumpkin"）
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // 方法 3: Z3 による厳密な SMT Unsat Core 診断（Continuous/実数変数にも対応・要 import "@ohtaman/washi/solvers/z3"）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

### Pumpkin `unsatCore`・Z3 `unsatCore`・HiGHS 弾性スラック診断 (`conflicts`) の違い

| 比較項目 | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **導入・依存関係** | **同梱プラグイン**（`@ohtaman/washi/solvers/pumpkin`・外部依存なし） | オプション依存パッケージ（`z3-solver`） | **標準搭載**（HiGHS）/ オプション `glpk.js` |
| **ブラウザ HTTP ヘッダー** | **不要**（`COOP` / `COEP` 不要） | `COOP` / `COEP` 必須（`SharedArrayBuffer`） | **不要** |
| **対応変数型** | 有界 `Integer`, `Binary`, `BoolVar` | `Continuous`, `Integer`, `Binary`, `BoolVar` | `Continuous`, `Integer`, `Binary`, `BoolVar` |
| **診断アルゴリズム** | 制約仮定に基づく LCG 矛盾解析 | SMT 仮定追跡（`assertAndTrack`） | 単一 solve による $L_1$ 弾性スラック最小化（$\min \sum s_i$） |
| **格納されるフィールド** | `result.unsatCore` と `result.conflicts` の両方 | `result.unsatCore` と `result.conflicts` の両方 | `result.conflicts` のみ（`unsatCore` は `undefined`） |
| **抽出結果の意味** | 同時に成立し得ない**論理的な矛盾ルール集合** | 同時に成立し得ない**論理的な矛盾ルール集合** | どの制約を緩めれば最小の違反量で実行可能に戻るかを表す**最小修復セット** |
| **単位スケールへの依存性** | **スケール不変**（係数の桁数に影響されない） | **スケール不変**（係数の桁数に影響されない） | **スケールに依存**（重みなしの $\sum s_i$ を最小化するため、予算 `10,000` 円の緩和よりも人数 `2` 人の緩和が優先して選ばれやすい） |

> [!TIP]
> 人数制約（$\le 8$ 人）と予算制約（$\le 50{,}000$ ドル）のように単位の桁数が大きく異なる制約が混在するモデルで、スケールに依存せず矛盾に関与するルールを特定したい場合は、有界整数・真偽値モデルであれば `COOP`/`COEP` 不要な **`m.check({ solver: "pumpkin" })`**、連続変数や小数閾値を含む場合は **`m.check({ solver: "z3" })`** を使用するか、制約の単位スケールを揃えることを推奨します。

---

## 解の独立検証 (`m.verify()`)

求解後（または `values` オプションでカスタム解を渡して）、得られた解が元のモデルの変数上下限・整数条件・線形制約・論理制約を許容誤差内で満たしているかを独立して検証できます：

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
    feasibilityTolerance: 1e-6,     // 変数上下限および線形制約の最大許容違反量
    integralityTolerance: 1e-6,     // Integer / Binary 変数の整数からの最大許容誤差
    evaluateLogicalConstraints: true,
  });

  console.log("検証結果 (valid):", report.valid);
  console.log("全項目評価済 (complete):", report.complete);
  console.log("最大違反量 (maxViolation):", report.maxViolation);
  console.log("集計サマリ:", report.summary);

  if (!report.valid) {
    console.warn("違反の詳細:", report.violations);
  }
}
```

### `VerificationReport` の主なプロパティ

| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `valid` | `boolean` | `complete === true` かつ `uncheckedConstraints.length === 0` かつ `violations.length === 0` のとき `true`。 |
| `complete` | `boolean` | すべての変数・論理変数・線形制約・論理制約が評価完了したとき `true`。 |
| `maxViolation` | `number` | 評価されたすべての境界・整数性・制約における違反量の最大値。 |
| `violations` | `VerificationViolation[]` | 検出された違反のリスト（`"missing_value"`, `"non_finite_value"`, `"invalid_boolean_value"`, `"lower_bound"`, `"upper_bound"`, `"integrality"`, `"linear_constraint"`, `"logical_constraint"`, `"unchecked_constraint"`）。 |
| `violationsByName` | `Record<string, VerificationViolation[]>` | 変数名または制約名ごとにグループ化された違反マップ。 |
| `uncheckedConstraints` | `string[]` | 変数値の欠落等により評価できなかった制約名のリスト。 |
| `missingVariables` | `string[]` | 値が `null` または `undefined` だった変数名のリスト。 |
| `summary` | `VerificationSummary` | 評価済み／全体の変数数・論理変数数・線形制約数・論理制約数の集計。 |

---

## LP 定式化の出力・確認 (`m.toLpString()`)

係数や符号、あるいは `m.indicator()` によって自動展開された Big-M 制約を確認したい場合は、`m.toLpString()` で標準的な CPLEX / HiGHS `.lp` 形式の文字列を出力できます：

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

## `MockSolver` によるアプリケーションの単体テスト

CI 環境などで WebAssembly をロードせずにアプリケーション側のモデル構築ロジックや結果処理ロジックを高速にテストしたい場合は、組み込みの `MockSolver`（`solver: "mock"`）を利用できます：

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
