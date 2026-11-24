# 冲突诊断 (`unsatCore`)、解验证与调试

当模型无解（`"Infeasible"`）或需要在上线前复核求解结果时，WaSHI 提供了四个内置工具：

- **定位冲突约束（`m.check()`）**：找出哪些命名约束彼此矛盾。
- **独立验证解（`m.verify()`）**：检查解是否满足所有上下界、整数条件和约束。
- **查看生成的方程（`m.toLpString()`）**：以 CPLEX `.lp` 格式导出模型，核对系数、符号和约束名称。
- **免 WebAssembly 单元测试（`MockSolver`）**：在 CI 中无需加载 WebAssembly 即可立即返回固定结果。

---

## 定位冲突约束 (`m.check()`)

`m.solve()` 返回 `"Infeasible"` 时，只能说明没有满足全部约束的解，但无法得知*哪些*规则发生了冲突。
要找出冲突约束，请调用 `m.check()`：有界整数和布尔模型可使用 `"pumpkin"`，包含 `Continuous` 变量或小数运算的模型请使用 `"z3"`：

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model();
const x = m.continuous("reserve", { lb: 0 });

// 为约束命名后再注册
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("冲突约束:", m.conflicts);
  // 输出: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

`routine_operating_cost`（$x \ge 10$）未参与直接矛盾，因此会被排除；结果只返回彼此冲突的 `minimum_regulatory_reserve`（$x \ge 100$）和 `budget_ceiling`（$x \le 50$）。

> [!IMPORTANT]
> - **请用 `m.check()` 而不是 `m.solve()` 诊断冲突**：`m.solve()` 只负责优化目标函数，不会返回冲突约束列表。要获取 `result.conflicts` / `m.conflicts`（别名 `result.unsatCore` / `m.unsatCore`），请调用 `m.check()`。
> - **为需要排查的规则命名**：变量定义时的 `lb` 和 `ub` 没有名称，因此不会出现在 `conflicts` 或 `unsatCore` 中。如果希望把某个上下界也纳入冲突原因，请额外通过 `m.constraint(expr`...`, "rule_name")` 将其注册为命名约束。

### 如何选择诊断求解器

当 `m.solve()` 返回 `"Infeasible"` 后，可根据模型特点选择以下三种方式之一：

| | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **适用模型** | 有界整数与布尔模型 | 包含 `Continuous` 变量或小数的模型 | 无需额外导入即可快速排查 |
| **安装与依赖** | 内置（`@ohtaman/washi/solvers/pumpkin`） | 可选（`z3-solver`） | 内置（`HiGHS`）/ 可选（`glpk.js`） |
| **浏览器响应头** | 无需配置 | 需要 `COOP` / `COEP` 响应头 | 无需配置 |
| **返回字段** | `unsatCore` 和 `conflicts` | `unsatCore` 和 `conflicts` | 仅 `conflicts`（`unsatCore` 为 `undefined`） |
| **结果含义** | 无法同时成立的冲突规则子集 | 无法同时成立的冲突规则子集 | 放宽后即可恢复可行的规则集合 |
| **量纲/数值尺度敏感性** | 不受影响 | 不受影响 | 会受影响（倾向于放宽数值较小的约束） |

```typescript
// 如使用 Pumpkin 或 Z3，请在文件顶部导入：
// import "@ohtaman/washi/solvers/pumpkin";
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // 方式 1：内置 HiGHS（无需额外导入；受数值尺度影响）
  const diag = await m.check();
  console.error("可放宽的约束:", diag.conflicts);

  // 方式 2：内置 Pumpkin（有界整数与布尔模型；无需 COOP/COEP 响应头）
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // 方式 3：Z3（支持 Continuous 变量与小数；需安装 z3-solver）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> 如果模型中同时存在数量级差异很大的约束（例如人数 $\le 8$ 与预算 $\le 50{,}000$），默认的 `m.check()`（HiGHS）更容易把数值较小的约束标记为冲突项。若希望诊断结果不受单位尺度影响，请使用 `pumpkin` 或 `z3`，或先统一约束的数值尺度。

---

## 独立验证解 (`m.verify()`)

求解完成后（或通过 `values` 传入自定义解），调用 `m.verify()` 可独立检查所有变量上下界、整数条件、线性约束和逻辑约束是否在容差范围内成立：

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
    feasibilityTolerance: 1e-6, // 上下界与线性约束的最大允许误差
    integralityTolerance: 1e-6, // Integer / Binary 变量偏离整数的最大允许误差
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

### `VerificationReport` 字段说明

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `valid` | `boolean` | 当 `complete === true` 且 `uncheckedConstraints` 与 `violations` 均为空时为 `true`。 |
| `complete` | `boolean` | 当所有变量与约束均已完成评估时为 `true`。 |
| `maxViolation` | `number` | 所有已检查的上下界、整数条件和约束中的最大违背量。 |
| `violations` | `VerificationViolation[]` | 检测到的违背项列表（上下界、整数条件、线性/逻辑约束或缺失/无效值）。 |
| `violationsByName` | `Record<string, VerificationViolation[]>` | 按变量名或约束名分组的违背项。 |
| `uncheckedConstraints` | `string[]` | 未能评估的约束名称列表。 |
| `missingVariables` | `string[]` | 值为 `null` 或 `undefined` 的变量名称列表。 |
| `summary` | `VerificationSummary` | 已检查与总变量数、约束数的统计汇总。 |

---

## 查看 LP 公式 (`m.toLpString()`)

如需核对系数、正负号或约束名称，可调用 `m.toLpString()` 导出标准 CPLEX `.lp` 格式文本：

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

## 免 WebAssembly 单元测试 (`MockSolver`)

在测试构建或读取 `Model` 的应用逻辑时，传入 `MockSolver` 可在不加载 WebAssembly 的情况下立即返回固定结果：

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
