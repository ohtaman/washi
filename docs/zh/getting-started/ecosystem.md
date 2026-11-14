# 生态对比与从 Python (PuLP) 迁移指南

`@ohtaman/washi` 提供了一个高层次的代数建模层，内置 HiGHS WebAssembly 并支持可选的 Z3 与 GLPK 适配器，在 Python PuLP 这类代数建模库与 JavaScript/WebAssembly 底层求解器绑定之间架起桥梁。

---

## 🧭 JavaScript 与 TypeScript 优化生态定位

在 TypeScript / JavaScript 中求解线性规划（LP）、混合整数线性规划（MIP / MILP）、凸二次规划（QP）或可满足性模理论（SMT）问题时，开发者通常会在以下三个层级中进行选择：

### 1. 代数建模器 + 多求解器运行时（`@ohtaman/washi`）

- **核心能力**：提供强类型的代数建模 API（`Model`、`Var`、`LinExpr`、`QuadExpr`、`BoolExpr`、`expr`、`sum`、`dot`、`m.indicator`、`m.validateSolution`、`solveColumnGeneration`、`solveBenders`），内置 **HiGHS** WebAssembly 运行时（MIT），并支持可选的 **Z3**（MIT）与 **GLPK**（GPL-3.0）插件。
- **主要差异**：无需手工拼接 CPLEX LP 字符串、稀疏矩阵或 JSON 行数组，可以直接使用支持 TypeScript 类型检查的 `Record<K, Var>` 与 `Var[]` 容器编写声明式数学公式。在浏览器中默认通过 Web Worker 异步执行（支持 `onProgress` 与 `AbortSignal` 取消），并内置 LP 导出检查（`m.toLpString()`）、解的独立校验（`m.validateSolution()`）以及不可行冲突诊断（`await m.check()`）。
- **适用场景**：员工排班、高校排课、资源分配、二维装箱、车辆路径规划、投资组合 QP 以及需要结合冲突诊断的业务规则系统。

### 2. 原生 WebAssembly 求解器绑定（`highs` / `highs-js`、`glpk.js`、`z3-solver`）

这些包为编译至 WebAssembly 的高性能 C/C++ 求解引擎提供直接的 JavaScript/TypeScript 接口：

- **[`highs`](https://github.com/lovasoa/highs-js)**（*MIT*）：通过 CPLEX LP / MPS 文本或矩阵输入直接调用 HiGHS（`highs.solve(lpText)`）。适合你已经在外部生成标准 LP/MPS 文件，或希望在 HiGHS 之上保持极薄封装的场景。
- **[`glpk.js`](https://github.com/jvail/glpk.js)**（*GPL-3.0*）：通过结构化 JSON 对象模式（`objective`、`subjectTo`、边界定义）直接调用 GLPK。适合在兼容 GPL-3.0 协议的项目中使用 GLPK 原生接口。
- **[`z3-solver`](https://www.npmjs.com/package/z3-solver)**（*MIT*）：Z3 官方 WebAssembly 绑定，完整暴露 Z3 的 AST 与 SMT 上下文（`Context`、`Solver`、`Optimize`、位向量、量词、未解释函数等）。适合需要超越命题逻辑与线性算术的底层 SMT 理论场景。

> [!NOTE]
> **WaSHI 与这些底层绑定的关系**：对于 **HiGHS**，WaSHI 直接从上游 [`ERGO-Code/HiGHS`](https://github.com/ERGO-Code/HiGHS) C++ 源码编译 WebAssembly，通过原生 C API 运行，零运行时依赖。对于 **GLPK** 与 **Z3**，WaSHI 将 `glpk.js` 和 `z3-solver` 作为可选的 peer 插件接入统一的 `Model` 接口——你可以只用 `expr` 编写一次模型，既能用 HiGHS 求解数值 MILP（`m.solve()`），也能用 Z3 进行规则冲突诊断（`m.check({ solver: "z3" })`）。如果你只需直接求解现有 LP 字符串或使用底层 Z3 SMT 理论，直接使用对应的上游绑定同样非常合适。

### 3. 纯 JavaScript 求解器（`yalps`、`javascript-lp-solver`）

- **[`yalps`](https://github.com/IanManske/yalps)**（*MIT*）与 **[`javascript-lp-solver`](https://github.com/JWally/jsLPSolver)**（*Unlicense*）：基于纯 JS/TS 实现的单纯形法与分支定界求解器，体积小且无需分发 `.wasm` 资源。
- **优势场景**：对包体积或零 `.wasm` 分发有严格要求的中小型 LP/MIP 问题。
- **何时升级至 WebAssembly / WaSHI**：当面临较大规模或约束紧密耦合的 MILP（如多班次排班、排课、二维装箱）时，编译为 WebAssembly 的 HiGHS C++ 预处理（Presolve）、割平面与启发式算法会带来显著的性能优势；此外纯 JS LP/MIP 库通常不包含凸 QP 或 SMT `unsatCore` 冲突诊断能力。

### 对比矩阵

| 包名 | 运行时 / 引擎 | 许可证 | 建模风格 | 支持问题类型 | 最佳适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@ohtaman/washi`** | 内置 HiGHS WASM + 可选 Z3 / GLPK | **MIT** *（GLPK 插件为 GPL-3.0）* | 代数表达式（`expr`、`sum`、`dot`、强类型 `Var` 容器、`indicator`） | LP, MIP / MILP, 凸QP, SMT（`BoolVar`, `unsatCore`） | TS/JS 完整优化建模、排班排课、QP、冲突诊断 |
| **`highs` (`highs-js`)** | HiGHS WASM | **MIT** | CPLEX LP / MPS 字符串或矩阵输入 | LP, MIP, 凸QP | 直接求解已生成的 LP/MPS 模型 |
| **`glpk.js`** | GLPK WASM | **GPL-3.0** | JSON 结构（`objective`、`subjectTo`、边界） | LP, MIP | 在 GPL-3.0 兼容项目中直接使用 GLPK |
| **`z3-solver`** | Z3 WASM（`SharedArrayBuffer` 多线程） | **MIT** | 底层 Z3 AST 与 SMT `Context` API | SMT, SAT, 形式化验证, `Optimize` | 需要位向量、量词等高级 SMT 理论 |
| **`yalps`** | 纯 TypeScript / JS | **MIT** | 对象 / Map 形式的 LP/MIP 结构 | LP, MIP | 无 `.wasm` 依赖的中小型 LP/MIP |
| **`javascript-lp-solver`** | 纯 JavaScript | **Unlicense** | JSON 模型对象 | LP, MIP | 无 `.wasm` 依赖的轻量级 LP/MIP |

---

## 🐍 从 Python (`PuLP`) 迁移到 WaSHI

如果你熟悉 Python 的 **[PuLP](https://github.com/coin-or/pulp)**，WaSHI 的建模流程与 PuLP 高度对应，同时在 TypeScript/浏览器生态中补充了类型安全、WebAssembly 本地求解、凸 QP 与 SMT 冲突诊断。

### 并排代码对比：生产计划 MILP

::: code-group

```typescript [TypeScript (WaSHI)]
import { Model, expr, maximize } from "@ohtaman/washi";

const products = ["desk", "chair"] as const;
const profit = { desk: 30, chair: 50 };
const wood = { desk: 1, chair: 2 };
const labor = { desk: 2, chair: 1 };

const m = new Model("Production");
const qty = m.integer(products, { lb: 0, ub: 100 });

m.objective(maximize(expr`dot(${profit}, ${qty})`));
m.constraint(expr`dot(${wood}, ${qty}) <= 40`, "wood_limit");
m.constraint(expr`dot(${labor}, ${qty}) <= 50`, "labor_limit");

const status = await m.solve();
const report = m.validateSolution();
console.log(status, report.valid, m.objectiveValue, m.getValues(qty));
// "Optimal", true, 1100, { desk: 20, chair: 10 }
```

```python [Python (PuLP)]
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, LpStatus, value

products = ["desk", "chair"]
profit = {"desk": 30, "chair": 50}
wood = {"desk": 1, "chair": 2}
labor = {"desk": 2, "chair": 1}

prob = LpProblem("Production", LpMaximize)
qty = LpVariable.dicts("qty", products, lowBound=0, upBound=100, cat="Integer")

prob += lpSum(profit[p] * qty[p] for p in products)
prob += lpSum(wood[p] * qty[p] for p in products) <= 40, "wood_limit"
prob += lpSum(labor[p] * qty[p] for p in products) <= 50, "labor_limit"

prob.solve()
print(LpStatus[prob.status], value(prob.objective), {p: value(qty[p]) for p in products})
# Optimal 1100.0 {'desk': 20.0, 'chair': 10.0}
```

:::

### 概念与 API 映射表

| 概念 | Python (`PuLP`) | TypeScript / JavaScript (`@ohtaman/washi`) |
| :--- | :--- | :--- |
| **创建模型** | `prob = LpProblem("Name", LpMaximize)` | `const m = new Model("Name")` + `m.objective(maximize(...))` |
| **标量变量** | `LpVariable("x", lowBound=0, upBound=10, cat="Integer")` | `m.integer("x", { lb: 0, ub: 10 })`（`continuous`、`integer`、`binary`、`bool`） |
| **索引变量集合** | `LpVariable.dicts("x", keys, lowBound=0)` | `m.integer(keys, { lb: 0 })` → 强类型 `Record<K, Var>`（传入数字生成 `Var[]` / `Var[][]`） |
| **求和与点积** | `lpSum(c[k] * x[k] for k in keys)` | `` expr`dot(${c}, ${x})` `` 或 `sum(keys, (k) => expr\`...\`)` |
| **添加约束** | `prob += expr <= 40, "limit"` | `m.constraint(expr\`... <= 40\`, "limit")` |
| **条件 / Big-M 约束** | 手动编写 Big-M 线性不等式 | `m.indicator(binVar, constraint, { activeValue: 0 })`（根据 `lb`/`ub` 自动推导紧凑 Big-M） |
| **求解** | `prob.solve()`（调用 CBC 等外部求解器） | `await m.solve()`（内置 HiGHS WASM；支持 `{ solver: "glpk" }` / `{ solver: "z3" }`） |
| **导出 LP 检查** | `prob.writeLP("model.lp")` | `m.toLpString()` |
| **读取求解结果** | `LpStatus[prob.status]`, `value(x)`, `value(prob.objective)` | `status`, `x.value`, `m.getValues(qty)`, `m.objectiveValue`, `c.dual`, `c.slack` |
| **校验与冲突诊断** | 手动校验 | `m.validateSolution()` 与 `await m.check()`（`conflicts` / Z3 `unsatCore`） |

### 面向 TypeScript 与浏览器应用的额外能力

- **从浏览器到 Node.js 的统一运行时**：无需维护 Python 后端服务，同一套模型代码既可运行于 Node.js API / CLI，也可在浏览器 Web Worker 中本地求解。
- **凸二次规划（QP / `QuadExpr`）**：在连续变量模型中直接使用 HiGHS 最小化二次目标（例如 `` expr`sum((${x} - ${target})^2)` ``）。
- **逻辑约束与不可行诊断（`m.check()`）**：直接编写 `implies`、`and`、`or`、`xor`、`not` 规则，并在不可行时通过 HiGHS 弹性松弛或 Z3 `unsatCore` 定位矛盾约束。
- **内置分解算法辅助**：直接提供列生成法（`solveColumnGeneration`）与 Benders 分解（`solveBenders`）编排器，用于大规模路径与下料优化问题。

---

## 🧭 下一步

- **[安装与入门](/zh/getting-started/)**：安装 `@ohtaman/washi` 并运行第一个模型
- **[求解器概览与对比](/zh/solvers/)**：对比 HiGHS、Z3、GLPK 与自定义求解器适配器
- **[决策变量与上下界](/zh/guide/variables)**：强类型 `Record` 与数组变量容器用法
- **[实际案例与 API 索引](/zh/examples/)**：11 个完整的 LP、MILP、QP 与 SMT 示例
- **[AI 编程助手快速参考](/zh/getting-started/ai-agents)**：面向 AI 编程助手的紧凑速查表与 `SKILL.md`
