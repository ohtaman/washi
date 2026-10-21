# AI 编程助手快速参考指南

> **范围说明**：本文档是面向使用 `@ohtaman/washi` 构建数理优化或可满足性（SAT/SMT）模型的 AI 编程助手与开发者的**使用端建模快速参考**。
> - **可移植 Agent Skill (`SKILL.md`)**：如需涵盖端到端建模、`toLpString()` 导出检查、`validateSolution()` 解验证以及 Z3 `unsatCore` 冲突诊断的完整工作流技能（兼容 Claude Code、Antigravity、Cursor、Codex 等支持 `SKILL.md` 的代理），请使用 [`skills/washi/SKILL.md`](https://github.com/ohtaman/washi/blob/main/skills/washi/SKILL.md)（同时随 npm 包分发于 `node_modules/@ohtaman/washi/skills/washi/SKILL.md`）：
>   ```bash
>   # 通过 skills CLI (skills.sh / vercel-labs/skills) 直接安装
>   npx skills add ohtaman/washi
>
>   # 或将随包附带的技能复制到项目的代理技能目录中
>   mkdir -p .agents/skills/washi
>   cp node_modules/@ohtaman/washi/skills/washi/SKILL.md .agents/skills/washi/SKILL.md
>   ```
> - **仓库审查规范**：关于仓库贡献规范与 Pull Request 代码审查规则，请参阅仓库根目录下的 [`AGENTS.md`](https://github.com/ohtaman/washi/blob/main/AGENTS.md)。

---

## 1. 包导入与部署规范

### Node.js / 构建工具 (Vite, Webpack, Next.js, Bun)

```ts
import {
  Model,
  expr,
  sum,
  dot,
  maximize,
  minimize,
  and,
  or,
  not,
  implies,
  xor,
  setHighsWasmUrl,
} from "@ohtaman/washi";

// 可选求解器插件（需先安装对应的 peer dependencies）：
// npm install z3-solver
import "@ohtaman/washi/solvers/z3";
// npm install glpk.js
import "@ohtaman/washi/solvers/glpk";
```

### 浏览器原生 ESM 与普通 `<script>` 标签

- **浏览器 ESM**:
  - 核心包（内置 HiGHS）: `import { Model, expr, maximize } from "./washi/washi.js";`
  - GLPK 插件: `import "./washi/solvers/glpk.js";`
  - Z3 插件: `import "./washi/solvers/z3.js";`
- **普通 `<script>` / CodePen (IIFE)**:
  - 核心包: `<script src="./washi/washi.min.js"></script>`（挂载全局变量 `Washi`）
  - GLPK 插件: `<script src="./washi/solvers/glpk.min.js"></script>`（注册 `"glpk"`，挂载 `WashiGLPK`）
  - Z3 插件: `<script src="./washi/solvers/z3.min.js"></script>`（注册 `"z3"`，挂载 `WashiZ3`）

### WebAssembly 资源与运行时规则

1. **默认使用随包内置的 WASM（无隐式 CDN 回退）**:
   - 在 Node.js 和现代构建工具中，WebAssembly 资源会自动相对于模块路径解析。
   - 在浏览器部署中，请将完整的 `dist/browser/` 目录（包含 JS、Worker 和 `.wasm` 文件）一起部署。如果本地 WASM URL 缺失或返回了 HTML SPA 回退页面，初始化会立即失败并报告所尝试的 URL——**绝不会**静默切换到公共 CDN。
   - 在浏览器运行时中，若需从自定义位置加载 `highs.wasm`，请调用 `setHighsWasmUrl("https://.../highs.wasm")` 或传入 `await m.solve({ wasmUrl: "https://.../highs.wasm" })`（在 Node.js 中会被忽略，Node.js 始终加载本地安装的 `highs` 包运行时）。
2. **浏览器中运行 Z3 需要安全上下文、跨源隔离（Cross-Origin Isolation）与 CORS**:
   - Z3 WebAssembly 依赖 `SharedArrayBuffer` 多线程。运行 Z3 的浏览器页面必须处于安全上下文（`window.isSecureContext === true`，即 HTTPS 或 `localhost`）且开启跨源隔离（`window.crossOriginIsolated === true`），服务端需配置以下响应头：
     - `Cross-Origin-Opener-Policy: same-origin`（主文档响应）
     - `Cross-Origin-Embedder-Policy: require-corp`（主文档响应）
     - `Cross-Origin-Resource-Policy: cross-origin` 与 `Access-Control-Allow-Origin`（跨域脚本 / WASM 资源响应）
   - 导入 `@ohtaman/washi` 绝不会自动注入 Service Worker。当浏览器缺少安全上下文或跨源隔离时，Z3 会立即以明确说明原因的错误 reject。
3. **Web Worker 与取消控制 (`AbortSignal`)**:
   - 求解前取消（执行开始前 `signal.aborted` 已为真）在所有求解器中均受支持。
   - 在支持 `Worker` 的浏览器环境中，HiGHS 默认在专用 Web Worker 中运行（`useWorker: true`）。向 `m.solve({ signal })` 传入 `{ signal }` 可以抢占式终止正在运行的 Worker 求解（或取消排队中的 Worker 请求）。
   - 在主线程运行 HiGHS 时（`useWorker: false` 或在 Node.js 中），支持在求解器中断检查点触发的 `onProgress` 回调内同步调用 `abort()` 实现协作式中途取消；来自外部的任意异步取消在同步 WASM 线程到达检查点或执行完成前无法抢占阻塞线程。无中断钩子的单线程 WASM 求解器（GLPK、Z3）会在执行开始前检查 `signal`。

---

## 2. 标准建模流程

构建并求解一个模型包含四个明确步骤：

### 步骤 1：创建模型与决策变量

```ts
const m = new Model("ExampleModel");

// 标量变量
const x = m.continuous("x", { lb: 0, ub: 100 });
const n = m.integer("n", { lb: 0, ub: 10 });
const b = m.binary("b");
const flag = m.bool("flag"); // 命题布尔变量（用于 Z3 / 逻辑约束）

// 多维索引变量容器：
// - 数字维度 -> Array
// - 键数组维度 -> Record
const vec = m.continuous(4, { lb: 0, prefix: "v" }); // Var[] (长度 4)
const grid = m.binary(2, 3, { prefix: "g" }); // Var[][] (2x3)
const byItem = m.integer(["desk", "chair"] as const, { lb: 0 }); // Record<"desk" | "chair", Var>
const mixed = m.binary(["A", "B"] as const, 3); // Record<"A" | "B", Var[]>
```

- **可选的原问题初始值提示 (`initialValue?: number`)**:
  - 数值变量构造函数（`m.continuous`、`m.integer`、`m.binary` 与 `new Var`）以及可变的 `v.initialValue` 属性支持传入可选的有限原问题初始值提示（以 `1e-6` 容差校验上下界 `[lb, ub]` 及整数/二元域），并与求解结果 `v.value` 保持独立。
  - 初始值可以是完整的或部分的（例如在重建 MIP 模型时按固定变量名传递）。提供 `initialValue` 仅作为求解提示——**不会**固定变量、添加硬约束，也不保证被求解器采纳或加速求解。
  - 受 **HiGHS**（`supportsWarmStart: true`）支持；不支持热启动的求解器（**GLPK**、**Z3**）在任何变量设置了 `initialValue !== undefined` 时会抛出错误。

### 步骤 2：构建表达式 (`expr`, `sum`, `dot`)

- **统一 `expr` 模板标签**:
  - 线性表达式（`LinExpr`）: `` expr`30 * ${x} + 50 * ${n} - 10` ``
  - 二次表达式（`QuadExpr`）: `` expr`${x}^2 + 2 * ${x} * ${n} + ${n}^2` ``（支持凸 QP 目标函数中的变量相乘与平方项）。
  - 线性约束（`Constraint`）: `` expr`${x} + 2 * ${n} <= 40` ``（支持 `<=`、`>=`、`==` 和 `=`）。
- **聚合函数**:
  - `sum(iterable, mapper?)` 对 `Var` / `LinExpr` / `number` 的 `Iterable`（例如 `Var[]`、`grid.flat()` 或 `Object.values(record)`）求和。
  - `dot(a, b)` 计算匹配的一维数组、二维数组（`number[][]` / `Var[][]`）、普通字典（`Record<string, ...>`）或混合 Array/Record 容器的内积，操作数顺序不限。
- **链式方法**:
  - 算术运算（在 `LinExpr` 和 `QuadExpr` 上支持；`Var` 支持 `.add()`、`.sub()`、`.mul()`、`.neg()`）: `.add(other)`、`.sub(other)`、`.mul(other)`、`.div(scalar)`、`.neg()`
  - 比较运算（在 `Var` 和 `LinExpr` 上支持）: `.le(rhs, name?)`、`.ge(rhs, name?)`、`.eq(rhs, name?)`
  - 布尔逻辑（面向 Z3 的 `BoolVar`、`BoolExpr` 和 `Constraint`）: 独立函数 `and(...)`、`or(...)`、`not(...)`、`implies(a, b)`、`xor(a, b)` 以及链式方法 `.and(...)`、`.or(...)`、`.not()`、`.implies(...)`、`.xor(...)`

### 步骤 3：向模型注册目标函数与约束条件

仅构造 `expr` 或 `.le()` 对象**不会**将其挂载到模型上，必须传入 `m.constraint(...)` 或 `m.objective(...)` 完成注册：

```ts
// 使用 maximize() 或 minimize() 设置目标函数
m.objective(maximize(expr`30 * ${x} + 50 * ${n}`));

// 将约束注册到模型
m.constraint(expr`${x} + 2 * ${n} <= 40`, "resource_limit");

// 指示约束 (MIP Big-M 转化: b === 1 => x <= 50)
m.indicator(b, expr`${x} <= 50`, { activeValue: 1, name: "cap_when_b" });
```

### 步骤 4：执行求解 (`solve` 或 `check`) 与校验解 (`validateSolution`)

- **数理优化 (`await m.solve(options?)`)**:
  - 返回 `SolverStatus`（`"Optimal"`、`"Feasible"`、`"Infeasible"`、`"Unbounded"`、`"TimeLimit"`、`"IterationLimit"`、`"Error"`、`"Unknown"`、`"NotSolved"`、`"Sat"` 或 `"Unsat"`）。内置优化求解器返回优化状态（`"Optimal"`、`"Feasible"`、`"Infeasible"`、`"Unbounded"`、`"TimeLimit"`、`"IterationLimit"`、`"Error"`、`"Unknown"`、`"NotSolved"`），其中因时间、迭代或解数量上限（或中断）停止但已找到合法可行解（Incumbent）的运行会返回 `"Feasible"`；`"Sat"` 与 `"Unsat"` 包含在 `SolverStatus` 中以供可满足性/自定义求解器适配器（如 `MockSolver`）使用。
  - 通过 `x.value`、`expr`...`.value`、`m.getValues(x)`、`m.getValues(container)`、`m.objectiveValue`、`constr.dual`、`constr.slack` 和 `x.reducedCost` 读取结果。
  - 求解后调用 `m.validateSolution()` 可独立校验变量有限性、变量上下界（`lb`/`ub`）、整数/二元/布尔域、线性约束残差以及逻辑约束（`SolutionValidationReport`：`{ valid, complete, maxViolation, violations, ... }`）。注意：`validateSolution()` 校验变量与约束的原问题可行性，不会重新计算或比对 `m.objectiveValue`。
- **可满足性检查与 Unsat Core (`await m.check(options?)`)**:
  - 返回 `CheckResult`（`{ status: "Sat" | "Unsat" | "Unknown", values: Record<string, number | boolean>, conflicts?: readonly string[], unsatCore?: readonly string[], runTime?: number }`），其中 `conflicts` 和 `unsatCore` 为可选字段，仅在支持不可行核提取的求解器（如 Z3）返回 `"Unsat"` 时填充。
  - 对于仅包含线性算术约束的模型，`m.check()` 会回退为可行性 `solve()`，因此可用于任何求解器（包括默认的 HiGHS 和 GLPK）。逻辑约束（`BoolVar`、`and`、`or`、`implies` 等）以及不可行核提取（`result.conflicts` / `result.unsatCore`）需要支持 SMT 的求解器（`{ solver: "z3" }`）。由于 Z3 在跟踪已注册约束的同时直接断言变量边界（`lb`/`ub`）和二元 `{0, 1}` 域，`conflicts` / `unsatCore` 报告的是*结合模型固定变量边界/域时*发生冲突的已注册约束名称子集（不保证最小性）。
- **异步 `solve` / `check` 期间禁止并发修改模型**:
  - 在 `await m.solve()` 或 `await m.check()` 挂起期间修改变量、约束或目标函数会使当前执行失效，并使过期的 Promise 被 reject。

---

## 3. 可直接运行的示例

### 示例 A：使用多维容器与解校验的混合整数线性规划 (MIP)

```ts
import { Model, expr, dot, sum, maximize } from "@ohtaman/washi";

export async function runMipExample() {
  const m = new Model("ProductionMIP");
  const products = ["desk", "chair"] as const;
  const profit = { desk: 30, chair: 50 };
  const woodPerUnit = { desk: 1, chair: 2 };
  const laborPerUnit = { desk: 2, chair: 1 };

  const qty = m.integer(products, { lb: 0, ub: 100 });
  const setup = m.binary("setup");

  m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${setup}`));
  m.constraint(expr`${dot(woodPerUnit, qty)} <= 40`, "wood_cap");
  m.constraint(expr`${dot(laborPerUnit, qty)} <= 50`, "labor_cap");
  m.constraint(expr`${sum(Object.values(qty))} <= 30 * ${setup}`, "require_setup");

  const status = await m.solve();
  const report = m.validateSolution();
  const values = m.getValues(qty);

  return {
    status,
    objectiveValue: m.objectiveValue,
    values,
    setup: setup.value,
    valid: report.valid,
    maxViolation: report.maxViolation,
  };
}
```

### 示例 B：凸二次规划 (QP)

二次目标函数支持在 `expr` 中直接书写变量乘积（`${x} * ${y}`）与平方项（`${x}^2`）：

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

export async function runQpExample() {
  const m = new Model("PortfolioQP");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // 在 x + y >= 4 约束下最小化 x^2 + y^2
  m.objective(minimize(expr`${x}^2 + ${y}^2`));
  m.constraint(expr`${x} + ${y} >= 4`, "budget");

  const status = await m.solve();
  const report = m.validateSolution();

  return {
    status,
    objectiveValue: m.objectiveValue,
    x: x.value,
    y: y.value,
    valid: report.valid,
  };
}
```

### 示例 C：Z3 可满足性检查与 Unsat Core 冲突诊断

```ts
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export async function runZ3Example() {
  const m = new Model("PolicyCheck", { solver: "z3" });
  const vip = m.bool("vip");
  const discount = m.integer("discount", { lb: 0, ub: 50 });

  m.constraint(vip, "customer_is_vip");
  m.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  m.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatResult = await m.check();
  return {
    status: unsatResult.status,
    conflicts: unsatResult.conflicts,
  };
}
```

---

## 4. 反面示例与常见陷阱

请避免以下无效写法和已废弃的旧别名：

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

export function verifyNegativePatterns() {
  const m = new Model("NegativeExamples");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // 1. 切勿将 Constraint 传给 m.objective() 或算术运算方法：
  // 错误: m.objective(maximize(expr`${x} <= 10` as any)); -> 抛出 Error
  // 错误: expr`${x} + 1`.add(expr`${y} <= 5` as any); -> 抛出 Error

  // 2. 切勿将不含比较运算符 (<=, >=, ==) 的算术表达式传给 m.constraint()：
  // 错误: m.constraint(expr`${x} + ${y}` as any); -> 抛出 Error

  // 3. 切勿在线性约束中包含二次项：
  // 错误: expr`${x}^2 <= 10`; -> 抛出 Error ("Quadratic constraints are not supported")

  // 4. 切勿使用已移除的旧别名（已在 #59 / #81 中移除）：
  // - 使用 `expr` 代替已废弃的 `c` 模板标签
  // - 使用 `m.constraint(...)` 代替 `m.constrain(...)` 或 `m.add(...)`
  // - 使用 `m.objective(maximize(...))` / `m.objective(minimize(...))` 代替 `m.maximize(...)` / `m.minimize(...)` / `m.setObjective(...)`
  // - 使用 `await m.solve()` 代替 `await m.optimize()`
  // - 使用 `.le()`, `.ge()`, `.eq()` 代替 `.lessThanOrEqual()`, `.greaterThanOrEqual()`, `.equalTo()`
  // - 使用 `.value` 或 `m.getValues(...)` 代替 `expr.getValue()`
  // - 使用 `m.variables` / `m.constraints` 代替 `m.vars` / `m.constrs`
  return { m, x, y, maximize };
}
```
