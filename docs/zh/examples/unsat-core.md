# 约束冲突诊断 (Z3 Unsat Core)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 不可行性诊断 / 不可满足核 (Unsat Core) | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">源代码</a></li></ul> |

当业务规则、预算限制和运营策略变得复杂时，约束之间往往会发生冲突。由于常规优化调用（`m.solve()`）仅返回 `"Infeasible"` 状态，WaSHI 提供了 `m.check()` 来直接定位引发矛盾的规则，无需人工逐条排查。

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
import { Model, implies, expr } from "@ohtaman/washi";
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
  m.constraint(implies(rushDelivery, expr`${engineers} >= 8`), "rush_staffing_rule");

  // 规则 4: 董事会设定的 $50,000 预算上限（引发冲突！）
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // 规则 5: 与冲突无关的无辜规则
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // 运行冲突诊断
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", m.conflicts);
  // ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]

  // 内置的 HiGHS 也可找出放宽后即可恢复可行的约束：
  const highsDiag = await m.check({ solver: "highs" });
  console.log("HiGHS Elastic Repair Set:", highsDiag.conflicts);
  // ["rush_required"]
}

diagnoseConflicts();
```

</CodeRunner>

## 实战要点

- **Pumpkin、Z3 与 HiGHS 的选择**：
  - **Pumpkin（`m.check({ solver: "pumpkin" })`）**：内置在 `@ohtaman/washi/solvers/pumpkin` 中，无需 `COOP` / `COEP` 响应头。如果将上例的 `budget` 改为 `m.integer(...)` 等有界整数与布尔模型，即可提取不受数值尺度影响的矛盾约束。
  - **Z3（`m.check({ solver: "z3" })`）**：支持 `Continuous` 变量与小数，可排除无关的 `minimum_one_employee` 并完整返回构成矛盾的 4 条规则，不受量纲影响。
  - **HiGHS（`m.check({ solver: "highs" })`）**：寻找使总放宽量最小的约束。相比放宽预算 `$14,000`，放宽加急要求只需 `1` 个单位，因此 HiGHS 会优先标记 `rush_required`。
