# 约束冲突诊断 (Z3 Unsat Core)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 不可行性诊断 / 不可满足核 (Unsat Core) | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">源代码</a></li></ul> |

当业务规则、预算限制和运营策略变得越来越复杂时，约束之间不可避免地会发生冲突。传统求解器通常只会简单地报错“不可行（Infeasible）”，让工程师不得不在成百上千条规则中盲目排查究竟是哪几条规则引发了矛盾。

本示例展示如何利用 Z3 的不可满足核（Unsat Core）提取功能，从命名约束中精准隔离出引发矛盾的约束子集（不保证极小性）。

## 存在冲突的场景

某技术团队正在为一个客户项目调配开发人员：
1. 每名工程师占用 $8,000 的项目预算（`budget_limit`）。
2. 客户要求加急交付（`rush_required`）。
3. 加急交付强制要求至少配置 8 名工程师（`rush_staffing_rule`）。
4. 董事会设定了 $50,000 的严格预算上限（`strict_board_budget_cap`）。
5. 劳动法规定项目至少需要配备 1 名员工（`minimum_one_employee`）。

请注意其中的矛盾：

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000 \text{ budget!}$$

## WaSHI 实现

<CodeRunner preset="conflict_diagnosis_unsat">

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflicts() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.integer("engineers", { lb: 0, ub: 20 });
  const budget = m.continuous("budget", { lb: 0, ub: 100000 });
  const rushDelivery = m.bool("rushDelivery");

  // 规则 1: 每名工程师成本为 $8,000
  m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

  // 规则 2: 客户要求加急交付
  m.constraint(rushDelivery, "rush_required");

  // 规则 3: 加急交付要求至少配备 8 名工程师
  m.constraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

  // 规则 4: 董事会设定的 $50,000 预算上限（引发冲突！）
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // 规则 5: 与冲突无关的无辜规则
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // 运行冲突诊断
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`);
  console.log("Conflicting Constraints (conflicts):", m.conflicts);
}

diagnoseConflicts();
```

</CodeRunner>
