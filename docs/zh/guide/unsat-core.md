# 冲突约束诊断 (`unsatCore`) 与解验证 (`validateSolution`)

在构建贴近实际业务的数理优化与规则配置系统时，通常会反复遇到以下两个验证问题：
1. **为什么我的模型不可行（Infeasible）？** 究竟是哪几条业务规则之间发生了相互矛盾？
2. **求解器返回的解真的满足每一条约束吗？** 如何独立校验数值容差、整数约束以及 LP 模型公式？

WaSHI 内置了完整的诊断与验证工具链：基于 Z3 的**不可行冲突核（Unsat Core）诊断**（`m.check()`）、**独立解验证**（`m.validateSolution()`）、**LP 格式公式导出**（`m.toLpString()`）以及**快速单元测试模拟求解器**（`MockSolver`）。

---

## 🔍 冲突约束诊断 (`unsatCore` / `conflicts`)

当模型**不可行（Infeasible）**时，传统的 MIP 求解器通常只报告“无可行解”，而不会指出具体是*哪些*约束发生了矛盾。
通过调用 **`await m.check({ solver: "z3" })`**，WaSHI 会利用 Z3 的 `assertAndTrack` 机制计算出**不可满足核（Unsatisfiable Core，`unsatCore`）**——即无法同时满足的命名约束冲突子集：

```typescript
import { Model, expr } from "@ohtaman/washi";
// 注册 Z3 求解器插件
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });

const x = m.continuous("reserve", { lb: 0 });

// 添加命名的业务规则约束
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("Contradictory constraints identified:");
  console.log(m.conflicts); // 或 result.conflicts / result.unsatCore / m.unsatCore
  // 输出: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

可以看到，`routine_operating_cost`（$x \ge 10$）**不在**冲突核中，因为只有 `minimum_regulatory_reserve`（$x \ge 100$）与 `budget_ceiling`（$x \le 50$）直接相互矛盾。

> [!IMPORTANT]
> - **请使用 `m.check({ solver: "z3" })` 提取 Unsat Core**：`m.solve()` 执行的是目标函数优化（`Z3.Optimize`），而 `m.check()` 执行的是带跟踪的可满足性检查（`Z3.Solver.assertAndTrack`），并填充 `result.conflicts` / `m.conflicts`（以及别名 `m.unsatCore`）。
> - **请为约束命名**：变量自带的上下界（`lb`、`ub`）作为背景定义域声明处理。如果希望将某个边界或业务规则包含在返回的 `unsatCore` 列表中，请通过 `m.constraint(expr`...`, "rule_name")` 将其注册为命名约束。

### 实战工作流：使用 HiGHS 优化，遇到不可行时交由 Z3 诊断

由于 WaSHI 模型与具体求解器解耦，您可以默认先用高速的 **HiGHS** 求解优化模型（`m.solve()`），仅当 HiGHS 返回 `"Infeasible"` 时自动回退到 **Z3** 的 `m.check()` 定位冲突规则：

```typescript
const status = await m.solve(); // 使用默认的 HiGHS 快速求解 MIP

if (status === "Infeasible") {
  const diag = await m.check({ solver: "z3" });
  console.error("Model is infeasible due to conflicting rules:", diag.conflicts);
}
```

---

## ✅ 独立解验证 (`m.validateSolution()`)

求解完成后（或通过 `values` 选项传入自定义候选解后），您可以对照原始模型定义，独立验证所有变量边界、整数/二元定义域、线性约束以及 SMT 逻辑公式是否在容差范围内成立：

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.validateSolution({
    feasibilityTolerance: 1e-6,     // 变量边界与线性约束的最大允许违反量
    integralityTolerance: 1e-6,     // Integer/Binary 变量距离最近整数的最大允许偏差
    evaluateLogicalConstraints: true,
  });

  console.log("Valid:", report.valid);
  console.log("Complete:", report.complete);
  console.log("Max violation:", report.maxViolation);
  console.log("Summary:", report.summary);

  if (!report.valid) {
    console.warn("Violations detected:", report.violations);
  }
}
```

### `SolutionValidationReport` 属性一览

| 属性 | 类型 | 说明 |
| :--- | :--- | :--- |
| `valid` | `boolean` | 当且仅当 `complete === true`、`uncheckedConstraints.length === 0` 且 `violations.length === 0` 时为 `true`。 |
| `complete` | `boolean` | 当所有变量、布尔变量、线性约束和逻辑约束均已完成评估时为 `true`。 |
| `maxViolation` | `number` | 所有已评估边界、整数性检查和约束中的最大数值违反量。 |
| `violations` | `SolutionViolation[]` | 检测到的违规详情列表（`"missing_value"`、`"non_finite_value"`、`"invalid_boolean_value"`、`"lower_bound"`、`"upper_bound"`、`"integrality"`、`"linear_constraint"`、`"logical_constraint"`、`"unchecked_constraint"`）。 |
| `violationsByName` | `Record<string, SolutionViolation[]>` | 按变量名或约束名分组的违规列表。 |
| `uncheckedConstraints` | `string[]` | 因缺失变量值等原因未能评估的约束名称列表。 |
| `missingVariables` | `string[]` | 取值为 `null` 或 `undefined` 的数值或布尔变量名称列表。 |
| `summary` | `SolutionValidationSummary` | 已检查与总计的变量、布尔变量、线性约束及逻辑约束数量统计。 |

---

## 📄 检查导出的 LP 模型公式 (`m.toLpString()`)

在调试系数、正负号或由 `m.indicator()` 自动展开的 Big-M 约束时，可调用 `m.toLpString()` 将模型导出为标准的 CPLEX/HiGHS `.lp` 格式文本：

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

## 🧪 使用 `MockSolver` 对应用逻辑进行单元测试

在为构建或消费 WaSHI `Model` 的业务代码编写单元测试时，可以使用内置的 `MockSolver`（`solver: "mock"`）立即返回确定性的测试结果，而无需加载 WebAssembly：

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
