# 冲突诊断 (`m.check()` / `unsatCore`)、解验证与调试

当模型无可行解（`"Infeasible"`）或需要在上线前复核求解结果时，WaSHI 提供了四个内置诊断与调试工具：

- **定位冲突约束（`m.check()`）**：找出哪些命名约束导致了不可行。
- **独立验证解（`m.verify()`）**：检查解是否满足所有变量上下界、整数条件和约束。
- **查看 LP 建模形式（`m.toLpString()`）**：以 CPLEX `.lp` 格式导出模型，核对系数、符号和约束名称。
- **免 WebAssembly 单元测试（`MockSolver`）**：在单元测试中无需加载 WebAssembly 即可立即返回固定结果。

---

## 定位冲突约束 (`m.check()`)

`m.solve()` 返回 `"Infeasible"` 时，只能说明不存在满足全部规则的解，但无法指出**哪些**规则发生了冲突。
要定位冲突原因，请调用 `m.check()`。
逻辑上的 **不可满足核心（Unsat Core）** 是指一组无法同时成立的命名约束子集——即使移除模型中的其他所有命名约束（保留变量上下界），这组约束依然相互矛盾。

对于仅包含有界整数变量与布尔值的模型，请传入 `{ solver: "pumpkin" }`；对于包含 `Continuous` 变量或非整数系数/常数的模型，请传入 `{ solver: "z3" }`：

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
  console.log("冲突约束:", result.unsatCore); // 也可通过 m.conflicts 读取
  // 输出: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

本例中，`routine_operating_cost` 未参与直接矛盾，因此被排除。
结果仅返回直接冲突的 `minimum_regulatory_reserve` 与 `budget_ceiling`。

> [!IMPORTANT]
> - **请用 `m.check()` 诊断冲突**：模型不可行时，`m.solve()` 仅返回 `"Infeasible"`，不会定位冲突原因。当结果为 `"Unsat"` 时，`m.check()` 会在所有求解器上填充 `conflicts`，并在 Pumpkin 和 Z3 上同时填充 `unsatCore`（HiGHS 和 GLPK 上为 `undefined`）。
> - **为需要排查的规则命名**：变量的 `lb` 和 `ub` 没有名称，不会出现在 `conflicts` 中。如需排查边界冲突，请通过 ``m.constraint(expr`...`, "rule_name")`` 注册命名约束。

### 如何选择诊断求解器

当 `m.solve()` 返回 `"Infeasible"` 后，可根据变量类型与尺度敏感性要求选择以下三种方式之一：

| 项目 | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()` / `{ solver: "glpk" }`) |
| :--- | :--- | :--- | :--- |
| **适用模型** | 有界整数与布尔模型 | 包含 `Continuous` 变量或非整数的模型 | 通用 LP / MIP 模型（使用 HiGHS 时无需额外导入） |
| **安装与依赖** | 内置（无需额外导入） | 可选（`z3-solver` + `@ohtaman/washi/solvers/z3`） | 内置默认（HiGHS）/ 可选（`glpk.js`） |
| **浏览器响应头** | 无需配置 | 需要 `COOP` / `COEP` 响应头 | 无需配置 |
| **返回字段** | `unsatCore` 和 `conflicts` | `unsatCore` 和 `conflicts` | 仅 `conflicts`（`unsatCore` 为 `undefined`） |
| **结果含义** | 不可满足核心（无法同时成立的规则子集） | 不可满足核心（无法同时成立的规则子集） | 弹性松弛集合（放宽后可恢复可行的规则） |
| **量纲/数值尺度敏感性** | 不受影响 | 不受影响 | 会受影响（倾向于放宽数值较小的约束） |

```typescript
// 仅使用 Z3 时需要在文件顶部导入（HiGHS 与 Pumpkin 均无需额外导入）：
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // 方式 1：内置 HiGHS（无需额外导入；受数值尺度影响）
  const diag = await m.check();
  console.error("可放宽的约束:", diag.conflicts);

  // 方式 2：内置 Pumpkin（有界整数与布尔模型；尺度无关的 Unsat Core）
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // 方式 3：Z3（支持 Continuous 变量与小数；需安装 z3-solver）
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> **为什么 HiGHS / GLPK 会受数值尺度影响**：在 HiGHS 与 GLPK 中，`m.check()` 会为包括自动命名在内的每条约束引入非负松弛变量（`<=` 减去、`>=` 加上、`==` 两侧同时引入），并最小化**无权重的总松弛量**。
> 当模型同时包含数量级差异悬殊的约束（例如人数 $\le 8$ 与预算 $\le 50{,}000$）时，放宽数值较小的约束所增加的总松弛量远小于放宽大数值约束，因此 HiGHS/GLPK 更容易优先标记前者。
> 若要减轻弹性松弛中的量纲偏差，请先统一约束的数值尺度；若需要与尺度无关的严格不可满足核心（Unsat Core），请使用 `pumpkin` 或 `z3`。

---

## 独立验证解 (`m.verify()`) {#verifying-solutions-m-verify}

求解完成后，调用 `m.verify()` 可独立检查所有变量上下界、整数条件、线性约束和逻辑约束是否在容差范围内成立。
您也可以通过 `values` 选项传入普通对象（而非 `Map`），例如 `m.verify({ values: { x: 1, y: 2 } })`，以验证外部生成的解：

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

## 查看 LP 建模形式 (`m.toLpString()`)

如需核对系数、正负号或约束名称，可调用 `m.toLpString()` 导出标准 CPLEX `.lp` 格式文本。
该方法会导出数值变量、线性/二次目标函数、线性约束以及已线性化的 `max`、`min`、`abs`、`at`、`!=` 表达式，但不包含命题布尔变量（`BoolVar`）与逻辑约束：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

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
