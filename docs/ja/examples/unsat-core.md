# 制約矛盾の診断 (Z3 Unsat Core)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 実行不能 (Infeasible) 診断・Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">ソースコード</a></li></ul> |

複数の業務ルールや数値制約が互いに矛盾して実行可能解が存在しない（`Unsat`）場合、名前付き制約の中から矛盾を引き起こしている制約の部分集合（Unsat Core。最小性は保証されません）を Z3 で抽出します。

## 矛盾が発生するシナリオ

ある開発チームが顧客プロジェクトの要員計画を立てています：
1. エンジニア1名あたり $8,000 のプロジェクト予算を消費する（`budget_limit`）。
2. 顧客から特急納品が要求されている（`rush_required`）。
3. 特急納品には最低 8 名のエンジニア配置が必須である（`rush_staffing_rule`）。
4. 役員会からプロジェクト予算の上限 $50,000 が厳命されている（`strict_board_budget_cap`）。
5. 労働基準により最低 1 名の社員を配置する必要がある（`minimum_one_employee`）。

ここで以下の矛盾が生じていることに注目してください：

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000 \text{ budget!}$$

## WaSHI による実装

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

- **Pumpkin・Z3・HiGHS の使い分け**:
  - **Pumpkin（`m.check({ solver: "pumpkin" })`）**: `@ohtaman/washi/solvers/pumpkin` に同梱されており、`COOP` / `COEP` ヘッダー不要です。`budget` を `m.integer(...)` にするなど有界整数と真偽値だけのモデルであれば、数値の桁数に左右されず矛盾制約を抽出できます。
  - **Z3（`m.check({ solver: "z3" })`）**: `Continuous` 変数や小数にも対応し、無関係な `minimum_one_employee` を除いた 4 つの矛盾ルールを桁数に関係なく抽出します。
  - **HiGHS（`m.check({ solver: "highs" })`）**: 制約を緩める合計量が最小になる箇所を探します。予算を `$14,000` 緩めるより特急要件を `1` 単位緩める方が数値が小さいため、`rush_required` が選ばれます。
