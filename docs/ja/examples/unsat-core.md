# 制約矛盾の診断 (Z3 Unsat Core)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 実行不能 (Infeasible) 診断・Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `m.constrain()`, `expr`, `m.check()`, `m.unsatCore` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">ソースコード</a></li></ul> |

複数の業務ルールや数値制約が互いに矛盾して実行可能解が存在しない（`Unsat`）場合、名前付き制約の中から矛盾を引き起こしている制約の部分集合（Unsat Core。最小性は保証されません）を Z3 で抽出します。

## WaSHI による実装

<CodeRunner preset="conflict_diagnosis_unsat">

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflict() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.integer("engineers", { lb: 0, ub: 20 });
  const budget = m.continuous("budget", { lb: 0, ub: 100000 });
  const rushDelivery = m.bool("rushDelivery");

  m.constrain(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");
  m.constrain(rushDelivery, "rush_required");
  m.constrain(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");
  m.constrain(expr`${budget} <= 50000`, "strict_board_budget_cap"); // 8名 * $8,000 = $64,000 > $50,000!
  m.constrain(expr`${engineers} >= 1`, "minimum_one_employee");     // 矛盾とは無関係なルール

  const res = await m.check({ solver: "z3" });
  console.log(`Status: ${res.status}`);
  console.log("Conflicting subset (unsatCore):", m.unsatCore);
}

diagnoseConflict();
```

</CodeRunner>
