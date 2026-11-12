# 冲突约束诊断 (`unsatCore`) 与解验证 (`validateSolution`)

在构建贴近实际业务的数理优化与规则配置系统时，通常会反复遇到以下两个验证问题：
1. **为什么我的模型不可行（Infeasible）？** 究竟是哪几条业务规则之间发生了相互矛盾？
2. **求解器返回的解真的满足每一条约束吗？** 如何独立校验数值容差、整数约束以及 LP 模型公式？

WaSHI 内置了完整的诊断与验证工具链：基于内置 HiGHS 弹性松弛或 Z3 **不可满足核（Unsat Core）**的**冲突约束诊断**（`m.check()`）、**独立解验证**（`m.validateSolution()`）、**LP 格式公式导出**（`m.toLpString()`）以及**快速单元测试模拟求解器**（`MockSolver`）。

---

## 冲突约束诊断 (`unsatCore` / `conflicts`)

当常规优化调用（`m.solve()`）返回 **`"Infeasible"`** 时，仅凭该状态只能得知不存在满足全部约束的可行解，而无法直接看出具体是*哪些*规则发生了冲突。
通过调用 **`await m.check({ solver: "z3" })`**，WaSHI 会利用 Z3 的 `assertAndTrack` 机制计算出**不可满足核（Unsatisfiable Core，`unsatCore`）**——即无法同时满足的命名约束冲突子集：

```typescript
import { Model, expr } from "@ohtaman/washi";
// 注册 Z3 求解器插件
import "@ohtaman/washi/solvers/z3";

const m = new Model();

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

### 实战工作流：使用 HiGHS 或 Z3 进行不可行约束诊断

由于 WaSHI 模型与具体求解器解耦，当模型不可行（`"Infeasible"`）时，您可选用两种方式排查原因：
1. **内置 HiGHS / GLPK**：`await m.check()` 采用单次求解弹性松弛模型（$\min \sum s_i$）定位需要松弛的冲突约束（`diag.conflicts`），无需安装任何额外依赖。
2. **Z3 SMT 求解器**：`await m.check({ solver: "z3" })` 借助 SMT 约束跟踪机制提取精确的不可满足核（`diag.unsatCore` / `diag.conflicts`）。

```typescript
const status = await m.solve(); // 使用默认的 HiGHS 快速求解 MIP

if (status === "Infeasible") {
  // 方式 1: 使用内置 HiGHS 单次求解弹性松弛直接诊断
  const diag = await m.check();
  console.error("冲突的约束规则:", diag.conflicts);

  // 方式 2: 使用 Z3 进行精确 SMT Unsat Core 诊断（需 import "@ohtaman/washi/solvers/z3"）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

### Z3 `unsatCore` 与 HiGHS 弹性松弛诊断 (`conflicts`) 的对比

| 维度 | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- |
| **诊断算法** | SMT 假设跟踪（`assertAndTrack`） | 单次求解 $L_1$ 弹性松弛最小化（$\min \sum s_i$） |
| **填充字段** | 同时填充 `result.unsatCore` 与 `result.conflicts` | 仅填充 `result.conflicts`（`unsatCore` 为 `undefined`） |
| **语义含义** | 无法同时成立的**矛盾规则子集** | 松弛后能以最小总违反量恢复可行性的**最小修复约束集** |
| **量纲尺度敏感性** | **尺度无关**（纯逻辑与代数矛盾分析） | **对量纲尺度敏感**（无权重最小化 $\sum s_i$ 时，松弛 `2` 名人手比松弛 `10,000` 元预算的总松弛量更小） |

> [!TIP]
> 当模型同时包含量级差异巨大的约束（例如人数 $\le 8$ 与预算 $\le 50{,}000$）时，若希望获得与量纲无关的完整矛盾规则集，请使用 **`m.check({ solver: "z3" })`**，或在构建约束时对不同量纲进行归一化。

---

## 独立解验证 (`m.validateSolution()`)

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

## 检查导出的 LP 模型公式 (`m.toLpString()`)

在调试系数、正负号或由 `m.indicator()` 自动展开的 Big-M 约束时，可调用 `m.toLpString()` 将模型导出为标准的 CPLEX/HiGHS `.lp` 格式文本：

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

## 使用 `MockSolver` 对应用逻辑进行单元测试

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
