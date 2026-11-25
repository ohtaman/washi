# 实际案例与 API 功能索引

本页汇总了使用 WaSHI 构建的可运行数理优化与逻辑建模示例。每个案例均可直接在其文档页面内执行，大部分示例也可以在 [Playground](https://washi.ohtaman.dev/demo/) 中在线编辑运行。

## 案例一览

| 案例 | 问题类型 | 求解器 | 核心 WaSHI API | 演示内容 | Playground / 指南 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[生产计划问题](./production.md)** | 整数规划 (MIP) | HiGHS | `m.integer()`, `m.constraint()`, `expr` | 整数变量定义、标签模板方程，以及在资源上限下最大化总利润。 | [Playground](https://washi.ohtaman.dev/demo/?preset=production) |
| **[0-1 背包问题](./knapsack.md)** | 0-1 整数规划 (MIP) | HiGHS | `m.binary(keys)`, `expr` (`dot`), `m.constraint()` | 一维 0-1 变量字典及物品数组上的加权聚合。 | [Playground](https://washi.ohtaman.dev/demo/?preset=knapsack) |
| **[运输与分配网络](./transportation.md)** | LP | HiGHS | `m.continuous(rows, cols)`, `expr` (`sum`, `dot`), `m.constraint()` | 二维矩阵索引（`ship[factory][store]`）与按行/列汇总的供给上限和需求满足约束。 | [Playground](https://washi.ohtaman.dev/demo/?preset=transportation) |
| **[营养问题与灵敏度分析](./diet-sensitivity.md)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解后读取对偶值（影子价格）、约束松弛量与变量缩减成本。 | [Playground](https://washi.ohtaman.dev/demo/?preset=diet_sensitivity) |
| **[员工排班与休假冲突诊断](./shift-scheduling.md)** | 0-1 整数规划 (MIP) + Unsat Core | HiGHS + Z3* | `m.binary(staff, days)`, `m.check()`, `m.unsatCore` | 5×7 周排班优化，以及用 Z3 `unsatCore` 诊断冲突的休假申请。 | [Playground](https://washi.ohtaman.dev/demo/?preset=shift_scheduling) |
| **[电商购物车与优惠券优化](./ecommerce-coupons.md)** | 指示约束 MIP | HiGHS | `m.indicator()`, `expr` (`sum`, `dot`), `m.constraint()` | 使用 `m.indicator()` 表达满减门槛、互斥券规则与加购凑单决策。 | [Playground](https://washi.ohtaman.dev/demo/?preset=cart_coupon) |
| **[投资组合优化 (QP)](./portfolio-qp.md)** | 凸二次规划 (QP) | HiGHS | `m.continuous()`, `m.constraint()`, `dot()`, `QuadExpr` | 使用 `QuadExpr` 最小化马科维茨均值-方差风险（$\mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$）。 | [Playground](https://washi.ohtaman.dev/demo/?preset=portfolio_qp) |
| **[资源受限项目调度 (CP)](./project-scheduling.md)** | CP + Unsat Core | Pumpkin | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `m.check()` | 含共享校准台互斥与 3 人团队上限的 6 工序调度及截止期冲突诊断。 | [Playground](https://washi.ohtaman.dev/demo/?preset=project_scheduling) |
| **[SMT 安全策略验证](./smt-security.md)** | SMT | Z3* | `m.bool()`, `implies()`, `.and()`, `not()`, `m.check()` | 命题布尔变量（`BoolVar`）与逻辑运算（`implies()`, `.and()`, `not()`）结合整数边界验证。 | [Playground](https://washi.ohtaman.dev/demo/?preset=smt_security) |
| **[约束冲突诊断 (Unsat Core)](./unsat-core.md)** | SMT / MIP + Unsat Core | Z3* + HiGHS | `m.constraint()`, `m.check()`, `m.conflicts` | 当人员配备要求与预算上限冲突时，提取导致矛盾的约束子集。 | [Playground](https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat) |
| **[车辆路径规划问题 (CVRP)](./vehicle-routing.md)** | 组合优化 / Dantzig-Wolfe | HiGHS | `m.solveColumnGeneration()`, `pricing`, `constr.dual` | 根据客户对偶值（影子价格）动态生成路径列，最小化车队规模。 | [分解法](../guide/decomposition.md) |
| **[旅行商问题 (TSP)](./traveling-salesperson.md)** | 组合优化 / Benders 分解 | HiGHS | `m.solveBenders()`, `subproblem` | 从度数分配松弛出发，利用动态 Benders 可行割消除子回路。 | [分解法](../guide/decomposition.md) |

> [!NOTE]
> **求解器前提条件**：HiGHS 与 Pumpkin 已内置于 WaSHI。标注 `Z3*` 的示例需安装可选 peer 包 `z3-solver`（浏览器端还需配置 `COOP`/`COEP` 响应头）。使用 GLPK 需安装 `glpk.js`（GPL-3.0 协议）。

## 按 WaSHI API 查找（反向索引）

想查找特定建模方法或求解器功能的用法，可直接跳转至对应示例或指南：

| 功能 / API | 用途说明 | 示例 / 指南 | Node.js 源码 |
| :--- | :--- | :--- | :--- |
| ``m.constraint(expr`...`)`` | 标签模板字面量定义约束 | [生产计划问题](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 一维键值字典形式的索引变量 | [0-1 背包问题](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 二维矩阵形式的索引变量 | [运输与分配网络](./transportation.md), [员工排班与休假冲突诊断](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| ``expr`dot(${A}, ${X})` `` / `dot(A, X)` | 向量与矩阵点积 | [0-1 背包问题](./knapsack.md), [运输与分配网络](./transportation.md), [投资组合优化 (QP)](./portfolio-qp.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts), [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` & `constr.slack` | 对偶值（影子价格）与约束松弛量 | [营养问题与灵敏度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | LP 中变量的缩减成本 | [营养问题与灵敏度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | Big-M 条件指示约束（`binVar => constr`） | [电商购物车与优惠券优化](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | 二次目标函数（$\mathbf{x}^T \mathbf{Q} \mathbf{x}$，适用于凸 QP） | [投资组合优化 (QP)](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.bool()` & `implies()` | 命题逻辑与 SMT 蕴含规则 | [SMT 安全策略验证](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` & `m.conflicts` | 可满足性检查与冲突诊断（`conflicts` / `unsatCore`） | [约束冲突诊断 (Unsat Core)](./unsat-core.md), [员工排班与休假冲突诊断](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| Z3 SMT + HiGHS MIP 混合流程 | 先用 Z3 验证策略一致性，再以 HiGHS 求解容量分配 | [Z3 指南](../solvers/z3.md) | [`07-hybrid-smt-mip.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/07-hybrid-smt-mip.ts) |
| `m.solveColumnGeneration()` | Dantzig-Wolfe 列生成法 | [车辆路径规划问题 (CVRP)](./vehicle-routing.md) | [`13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts) |
| `m.solveBenders()` | Benders 分解与延迟割平面分离 | [旅行商问题 (TSP)](./traveling-salesperson.md) | [`14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts) |
| `disjoint()` / `cumulative()` / `max()` | 调度全局约束与完工时间目标函数 | [资源受限项目调度 (CP)](./project-scheduling.md), [约束规划 (CP) 建模](../guide/constraint-programming.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `distinct()` / `allowed()` / `at()` | CP 互异、表约束与元素索引查找 | [约束规划 (CP) 建模](../guide/constraint-programming.md), [代数表达式](../guide/expressions.md) | — |
| `solver: "pumpkin"` | 内置 Pumpkin 的 CP 调度求解与离散模型冲突诊断 | [资源受限项目调度 (CP)](./project-scheduling.md), [Pumpkin 指南](../solvers/pumpkin.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `solver: "glpk"` | 通过可选 `glpk.js`（GPL-3.0）插件求解 LP/MIP | [GLPK 指南](../solvers/glpk.md) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

## 在本地（Node.js）运行示例

所有独立脚本均位于仓库的 [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) 目录下，克隆仓库并安装依赖后可通过 `npx tsx` 直接运行（使用 Z3 或 GLPK 的示例需额外安装对应的可选包）：

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
npx tsx examples/node/13-vehicle-routing-column-generation.ts
npx tsx examples/node/14-traveling-salesperson-benders.ts
npx tsx examples/node/15-project-scheduling-cp.ts
```
