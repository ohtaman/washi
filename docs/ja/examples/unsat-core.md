# 制約矛盾の診断 (Unsat Core)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 実行不能 (Infeasible) 診断・Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">ソースコード</a></li></ul> |

通常の最適化（`m.solve()`）では、制約が矛盾しても `"Infeasible"` が返るだけで原因は分かりません。`m.check()` を使うと `"Unsat"` とともに矛盾箇所を特定できます。Z3 や Pumpkin などの SMT/CP ソルバーは同時には満たせない制約集合である **Unsat Core** を抽出し、HiGHS などの MIP ソルバーは **Elastic Repair Set** を返します。

この例では Z3 と HiGHS で競合を診断し、結果を `res.conflicts`（`m.conflicts` でも参照可能）から読み取ります。このシナリオでは Z3 が無関係なルールを除外しますが、一般に返される Unsat Core の極小性・最小性は保証されません。

## 矛盾が発生するシナリオ

ある開発チームが顧客プロジェクトの要員計画を立てています。
1. エンジニア 1 名あたり $8,000 の人件費がかかり、総額はプロジェクト予算（`budget`）以内に収める（`budget_limit`）。
2. 顧客から特急納品が要求されている（`rush_required`）。
3. 特急納品には最低 8 名のエンジニア配置が必須である（`rush_staffing_rule`）。
4. 役員会によりプロジェクト予算の上限が $50,000 と定められている（`strict_board_budget_cap`）。
5. 労働基準により最低 1 名のエンジニアを配置する必要がある（`minimum_one_employee`）。

これらの条件は次のように矛盾します。

$$8 \text{ 名} \times \$8,000 = \$64,000 > \$50,000$$

## WaSHI による実装

> [!NOTE]
> **Z3 の前提条件:** `@ohtaman/washi/solvers/z3` を使うには、任意の `peerDependencies` パッケージ `z3-solver`（`npm install z3-solver`）が必要です。ブラウザ上で Z3 を実行する場合は `COOP` / `COEP` ヘッダーも必要になります（詳しくは [Cross-Origin Isolation](../getting-started/cross-origin.md) を参照してください）。

<CodeRunner preset="conflict_diagnosis_unsat">

```typescript
import { Model, implies, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflicts() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.integer("engineers", { lb: 0, ub: 20 });
  const budget = m.continuous("budget", { lb: 0, ub: 100000 });
  const rushDelivery = m.bool("rushDelivery");

  // ルール 1: エンジニア 1 名あたり $8,000 のコスト
  m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

  // ルール 2: 顧客が特急納品を要求
  m.constraint(rushDelivery, "rush_required");

  // ルール 3: 特急納品には最低 8 名のエンジニアが必要
  m.constraint(implies(rushDelivery, expr`${engineers} >= 8`), "rush_staffing_rule");

  // ルール 4: 役員会による予算上限 $50,000（ルール 1〜3 と矛盾）
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // ルール 5: 矛盾とは無関係なルール
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // 競合診断を実行
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", res.conflicts); // m.conflicts でも参照可能
  // ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]

  // 標準搭載の HiGHS でも、緩めると解ける制約を特定できます:
  const highsDiag = await m.check({ solver: "highs" });
  console.log("HiGHS Elastic Repair Set:", highsDiag.conflicts);
  // ["rush_required"]
}

diagnoseConflicts();
```

</CodeRunner>

## 実務上のポイント

### Z3（`m.check({ solver: "z3" })`）

Z3 は `budget` のような連続変数（`m.continuous()`）や小数係数に対応しています。数値スケールに左右されず、無関係な `minimum_one_employee` を除いた 4 つの矛盾ルールを返します。

### Pumpkin（`m.check({ solver: "pumpkin" })`）

Pumpkin は `@ohtaman/washi/solvers/pumpkin` に同梱されており、`z3-solver` やブラウザの `COOP` / `COEP` ヘッダーは不要です。`budget` を `m.integer()` にするなど、すべての変数が有界整数・真偽値であれば、数値スケールに依存しない Unsat Core を抽出できます。

### HiGHS（`m.check({ solver: "highs" })`）

HiGHS は Unsat Core ではなく、実行可能にするための制約緩和量（スラック）の総和が最小となる修復候補（**Elastic Repair Set**）を探します。そのため、Z3 や Pumpkin が `conflicts` と `unsatCore` の両方を返すのに対し、HiGHS は `conflicts` のみを設定し `unsatCore` は `undefined` のままにします。予算上限を `$14,000` 緩めるより `rush_required` を `1` 緩める方が数値として小さいため、`rush_required` が選ばれます。
