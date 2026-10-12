# 制約矛盾の診断 (Z3 Unsat Core)

**問題クラス:** 実行不能（Infeasible）診断・Unsat Core · **ソルバー:** Z3 (`@ohtaman/washi/solvers/z3`) · **主な API:** `m.check()`, `m.unsatCore`  
**[`</> Playground で開く`](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat)** · **ソースコード:** [`examples/node/05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts)

複数の業務ルールや数値制約が互いに矛盾して実行可能解が存在しない（`Unsat`）場合、名前付き制約の中から矛盾を引き起こしている制約の部分集合（Unsat Core。最小性は保証されません）を Z3 で抽出します。

---

## WaSHI による実装

```typescript
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflict() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
  const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
  const rushDelivery = m.addBoolVar("rushDelivery");

  m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");
  m.addConstraint(rushDelivery, "rush_required");
  m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");
  m.addConstraint(budget.le(50000), "strict_board_budget_cap"); // 8名 * $8,000 = $64,000 > $50,000!
  m.addConstraint(engineers.ge(1), "minimum_one_employee");     // 矛盾とは無関係なルール

  const res = await m.check({ solver: "z3" });
  console.log("Status:", res.status); // "Unsat"
  console.log("Conflicting subset:", m.unsatCore);
  // -> ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
}

diagnoseConflict();
```
