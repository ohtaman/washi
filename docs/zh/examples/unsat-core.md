# 约束冲突诊断 (Unsat Core)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 不可行性诊断 / 不可满足核 (Unsat Core) | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">源代码</a></li></ul> |

当约束之间发生冲突时，常规优化调用（`m.solve()`）只会返回 `"Infeasible"`。改用 `m.check()` 则会返回 `"Unsat"` 并诊断冲突约束：Z3、Pumpkin 等 SMT/CP 求解器提取无法同时满足的**不可满足核（Unsat Core）**，而 HiGHS 等 MIP 求解器返回**弹性修复集（Elastic Repair Set）**。

本示例分别使用 Z3 与 HiGHS 诊断冲突，并通过 `res.conflicts`（同时保存在 `m.conflicts` 中）读取结果。在此场景下 Z3 会排除无关约束，但一般而言返回的 Unsat Core 不保证极小性或最小性。

## 存在冲突的场景

某技术团队正在为一个客户项目调配开发人员：
1. 每名工程师的人力成本为 $8,000，总成本不得超过项目预算 `budget`（`budget_limit`）。
2. 客户要求加急交付（`rush_required`）。
3. 加急交付强制要求至少配置 8 名工程师（`rush_staffing_rule`）。
4. 董事会设定了 $50,000 的严格预算上限（`strict_board_budget_cap`）。
5. 劳动法规定项目至少需要配备 1 名工程师（`minimum_one_employee`）。

这些规则直接构成矛盾：

$$8 \text{ 名工程师} \times \$8,000 = \$64,000 > \$50,000$$

## WaSHI 实现

> [!NOTE]
> **Z3 前置条件：** 引入 `@ohtaman/washi/solvers/z3` 需要先安装可选对等依赖 `z3-solver`（`npm install z3-solver`）。在浏览器中使用 Z3 还需要配置 `COOP` / `COEP` 响应头，详见 [跨源隔离](../getting-started/cross-origin.md)。

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

  // 规则 4: 董事会设定的 $50,000 预算上限（与规则 1–3 矛盾）
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // 规则 5: 与冲突无关的无辜规则
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // 运行冲突诊断
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", res.conflicts); // 也可通过 m.conflicts 读取
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

### Z3（`m.check({ solver: "z3" })`）

Z3 支持 `budget` 这类连续变量（`m.continuous()`）与小数系数。它不受数值量纲影响，能排除无关的 `minimum_one_employee` 并返回构成冲突的 4 条规则。

### Pumpkin（`m.check({ solver: "pumpkin" })`）

Pumpkin 内置于 `@ohtaman/washi/solvers/pumpkin`，无需安装 `z3-solver`，也无需浏览器 `COOP` / `COEP` 响应头。若所有变量均为有界整数或布尔值（例如将 `budget` 改为 `m.integer()`），Pumpkin 同样可以提取与数值尺度无关的 Unsat Core。

### HiGHS（`m.check({ solver: "highs" })`）

与 Unsat Core 不同，HiGHS 返回的是**弹性修复集（Elastic Repair Set）**——即恢复可行性所需总松弛量最小的约束集合。Z3 与 Pumpkin 会同时填充 `conflicts` 和 `unsatCore`，而 HiGHS 仅填充 `conflicts`，将 `unsatCore` 保持为 `undefined`。相比将预算上限放宽 `$14,000`，放宽 `rush_required` 仅需 `1` 个单位，因此 HiGHS 标记了 `rush_required`。
