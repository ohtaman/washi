# 数理优化指南与术语表

本页汇总了学习 **数理优化百题训练** 所需的核心建模术语、判题结果含义与基本建模规范。

## 1. 判题机制（`solve(input)`） {#solve-contract}

- 每道题都要求实现一个函数：在 **WaSHI (TypeScript)** 中实现 `solve(input)`，或在 **PuLP (Python)** 中实现 `solve(input_data)`，并返回结果 JSON 对象（Python 为 `dict`）。
- **WaSHI** 本身是 TypeScript / JavaScript 建模库而非 Python 包；为了让 Python 使用者也能免安装直接在浏览器中刷题并对照写法，系统通过 Pyodide 提供了经典的 **PuLP (Python)**（后端为 HiGHS）作为并行练习环境。
- 点击 **「运行并判题」** 后，系统会对每个测试用例传入输入并检查返回值是否满足约束且达到最优目标值。
- 在**任意一种**运行时下通过（**AC**）即可标记为已完成（`✓`）。`console.log` 或 `print` 仅用于调试查看。

## 2. 模型基本要素 {#building-blocks}

| 术语 | 含义 | WaSHI (TS) | PuLP (Python) |
| --- | --- | --- | --- |
| **决策变量** (Decision Variable) | 由求解器决定取值的未知量。 | `m.continuous(...)` / `m.integer(...)` / `m.binary(...)` | `pulp.LpVariable(..., cat=pulp.LpContinuous / LpInteger / LpBinary)` |
| **上下界** (Bounds) | 单个变量的取值范围限制（例如 $x \ge 0$）。 | `{ lb: 0, ub: cap }` | `lowBound=0, upBound=cap` |
| **线性表达式** (Linear Expression) | 变量的常数倍之和加常数项（如 $2x + 3y$）。 | ``expr`2 * ${x} + 3 * ${y}` `` 或 `dot(...)` | `2 * x + 3 * y` 或 `pulp.lpSum(...)` |
| **约束条件** (Constraint) | 有效解必须满足的等式或不等式（`<=`, `>=`, `==`）。 | ``m.constraint(expr`... <= ...`)`` | `prob += ... <= ...` |
| **目标函数** (Objective) | 需要最小化或最大化的标量指标（成本、利润等）。 | `m.objective(maximize(...))` / `minimize(...)` | `LpProblem(..., LpMaximize / LpMinimize)` + `prob += ...` |

### 变量类型 {#variable-types}

- **连续变量 (`continuous`)**：在上下界范围内可取任意实数（如 `12.5`），用于线性规划（**LP**）。
- **整数变量 (`integer`)**：只能取整数（`0, 1, 2, ...`），用于不可分割的数量（**MIP**）。
- **0-1 二元变量 (`binary`)**：只能取 `0` 或 `1`，常用于表示是否选择或是否启用。

## 3. 判题结果与求解状态 {#verdicts}

| 判题结果 | 含义 | 常见原因 |
| --- | --- | --- |
| **AC** | 通过（所有用例均满足约束且达到最优值） | 模型与返回结果均正确。 |
| **SUBOPTIMAL** | 可行但非最优 | `minimize` 与 `maximize` 写反、目标系数遗漏、添加了多余约束。 |
| **VIOLATION** | 违反题目约束条件 | 漏写约束、`<=` 与 `>=` 方向写反，或整数取整破坏了约束。 |
| **INFEASIBLE** | 无可行解 | 存在互相矛盾的约束（例如 $x \ge 10$ 且 $x \le 5$）。 |
| **ERROR** | 运行错误、未求解或返回格式有误 | 忘记写 `await m.solve()`、模型无界（Unbounded）、返回字段名有误。 |

### 求解状态术语 {#solver-status}

- **最优解 (Optimal)**：在全部可行解中已被证明目标值最佳的解。
- **可行解 (Feasible)**：满足所有约束和上下界的解（不一定最优）。
- **不可行 (Infeasible)**：约束条件互相矛盾，没有任何解能同时满足全部要求。
- **无界 (Unbounded)**：目标值可以无限改善（通常是因为漏写了资源上限或变量上界）。
- **未求解 (NotSolved)**：在读取变量值之前未调用求解函数。

## 4. 常见优化问题类型 {#paradigms}

- **LP（线性规划）**：连续变量配合线性目标和线性约束，可在可行多面体顶点处快速求得全局最优解。
- **MIP（混合整数规划）**：在 LP 中加入整数或 0-1 变量，用于表达离散数量、布尔选择以及固定成本开关（**Big-M**）。
- **CP / SMT**：约束规划与可满足性模理论，擅长处理排班、逻辑规则与冲突诊断（后续章节介绍）。

## 5. 相关链接与参考资料 {#resources}

聚焦于 WaSHI 的核心场景——**组合优化（LP / MIP / CP / SMT）**的官方文档与精选参考资料：

### 建模库与求解器官方文档

- [WaSHI 文档（快速开始）](/zh/getting-started/) / [建模技巧](/zh/guide/formulation-tips) — WaSHI 本体 API、各求解器后端与建模指南。
- [PuLP 官方文档](https://coin-or.github.io/pulp/) — `PuLP (Python)` 标签使用的 LP / MIP 代数建模库文档（英文）。
- [HiGHS](https://highs.dev/)（[文档](https://ergo-code.github.io/HiGHS/)） — 同时支撑 WaSHI 与 PuLP 求解 LP / MIP 的开源求解器（英文）。
- [Google OR-Tools](https://developers.google.com/optimization) — 涵盖 MIP、车辆路径、排程与 CP-SAT 约束规划的官方指南与示例（英文）。
- [The MiniZinc Handbook](https://docs.minizinc.dev/en/stable/) — 约束规划（CP）与全局约束建模的标准手册（英文）。
- [JuMP 文档](https://jump.dev/JuMP.jl/stable/) — Julia 代数建模语言文档，提供精炼的 LP / MIP 建模模式介绍（英文）。
- [Pumpkin (ConSol-Lab)](https://github.com/ConSol-Lab/Pumpkin) — WaSHI 约束规划（CP）后端采用的 Lazy Clause Generation 求解器（英文）。
- [Online Z3 Guide](https://microsoft.github.io/z3guide/) — 面向 SMT 求解器 Z3 的在线交互式教程与参考（英文）。

### 组合优化建模指南与问题库

- [MOSEK Modeling Cookbook](https://docs.mosek.com/modeling-cookbook/index.html) — 实用的建模技巧手册，其中混合整数优化章节（Big-M、指示约束、线性化）尤为值得参考（英文）。
- [Hands-On Mathematical Optimization with Python (`MO-book`)](https://mobook.github.io/MO-book/) — 配备可运行 Jupyter Notebook 的开源书籍，系统介绍网络流与 MIP 建模（英文）。
- [CSPLib](https://www.csplib.org/) — 约束规划与组合优化领域的经典标准问题库（英文）。
- [Pythonによる実務で役立つ最適化問題100+（SCMOPT `opt100`）](https://scmopt.github.io/opt100/) — 同名书籍系列的在线配套教程与模型详解，系统覆盖图论、物流配送与排程（日语）。
