# 制約矛盾の診断 (Z3 Unsat Core)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 実行不能 (Infeasible) 診断・Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">ソースコード</a></li></ul> |

通常の最適化（`m.solve()`）では、制約が衝突しても `"Infeasible"` としか分かりません。`m.check()` を呼ぶと `"Unsat"` とともに、同時には満たせない名前付き制約の部分集合である **Unsat Core** を抽出できます。

この例では Z3 を使い、無関係な制約を除いた矛盾ルールだけを `m.conflicts` として取得します。なお、返される部分集合の最小性は保証されません。

## 矛盾が発生するシナリオ

ある開発チームが顧客プロジェクトの要員計画を立てています。
1. エンジニア 1 名あたり $8,000 のプロジェクト予算を消費する（`budget_limit`）。
2. 顧客から特急納品が要求されている（`rush_required`）。
3. 特急納品には最低 8 名のエンジニア配置が必須である（`rush_staffing_rule`）。
4. 役員会からプロジェクト予算の上限 $50,000 が厳命されている（`strict_board_budget_cap`）。
5. 労働基準により最低 1 名の社員を配置する必要がある（`minimum_one_employee`）。

これらの条件は次のように矛盾します。

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000 \text{ budget!}$$

## WaSHI による実装

> [!NOTE]
> **Z3 の前提条件:** `@ohtaman/washi/solvers/z3` を使うには、オプションのピア依存パッケージ `z3-solver`（`npm install z3-solver`）が必要です。ブラウザ上で Z3 を実行する場合は `COOP` / `COEP` ヘッダーも必要になります（詳しくは [Cross-Origin Isolation](../getting-started/cross-origin.md) を参照してください）。

<CodeRunner preset="conflict_diagnosis_unsat">

```typescript
import { Model, implies, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflicts() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.integer("engineers", { lb: 0, ub: 20 });
  const budget = m.continuous("budget", { lb: 0, ub: 100000 });
  const rushDelivery = m.bool("rushDelivery");

  // ルール 1: エンジニア1名あたり $8,000 のコスト
  m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

  // ルール 2: 顧客が特急納品を要求
  m.constraint(rushDelivery, "rush_required");

  // ルール 3: 特急納品には最低 8 名のエンジニアが必要
  m.constraint(implies(rushDelivery, expr`${engineers} >= 8`), "rush_staffing_rule");

  // ルール 4: 役員会による予算上限 $50,000（矛盾の原因！）
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // ルール 5: 矛盾とは無関係なルール
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // 競合診断を実行
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", m.conflicts);
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

Z3 は `budget` のような `Continuous` 変数や小数係数に対応しています。数値の桁数に左右されず、無関係な `minimum_one_employee` を除いた 4 つの矛盾ルールを返します。

### Pumpkin（`m.check({ solver: "pumpkin" })`）

Pumpkin は `@ohtaman/washi/solvers/pumpkin` に同梱されており、`z3-solver` やブラウザの `COOP` / `COEP` ヘッダーは不要です。`budget` を `m.integer()` にするなど、すべての変数が有界整数・真偽値であれば、数値スケールに依存しないコアを抽出できます。

### HiGHS（`m.check({ solver: "highs" })`）

HiGHS は、実行可能にするために制約を緩める数値量の合計が最小となる箇所を探します。予算上限を `$14,000` 緩めるより特急要件を `1` 単位緩める方が小さいため、`rush_required` が選ばれます。
