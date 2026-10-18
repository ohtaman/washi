# 实际案例与 API 功能索引

本页汇总了使用 WaSHI 构建的可运行数理优化与逻辑建模示例。每个案例均可直接在其文档页面内执行，也可以在 [Playground](https://ohtaman.github.io/washi/demo/) 中在线编辑和运行。

## 案例一览

| 案例 | 问题类型 | 求解器 | 核心 WaSHI API | 演示内容 | 代码编辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[生产计划问题](/zh/examples/production)** | LP / MIP | HiGHS | `m.integer()`, `m.constraint()`, `expr` | 决策变量定义、标签模板字面量方程，以及在资源约束下最大化总利润。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 背包问题](/zh/examples/knapsack)** | Binary MIP | HiGHS | `m.binary(keys)`, `sum()`, `m.constraint()` | 一维 `Binary` 变量字典及物品数组上的线性聚合。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[运输与分配网络](/zh/examples/transportation)** | LP | HiGHS | `m.continuous(rows, cols)`, `dot()`, `m.constraint()` | 二维矩阵索引（`ship[factory][store]`）与行/列供需流量平衡约束。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[营养问题与灵敏度分析](/zh/examples/diet-sensitivity)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解后读取影子价格（瓶颈识别）、约束松弛量（盈余）与变量缩减成本。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |
| **[员工排班与冲突诊断](/zh/examples/shift-scheduling)** | Binary MIP + Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `check()`, `unsatCore` | 5×7 周排班规划（每日人数覆盖、资深员工值班、排班上限与休假申请），以及使用 Z3 `unsatCore` 诊断冲突的休假申请。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[购物车优惠券最优组合](/zh/examples/ecommerce-coupons)** | Indicator MIP | HiGHS | `m.indicator()`, `sum()`, `m.constraint()` | 使用 `m.indicator()` 对最低消费门槛、互斥与可叠加规则建模，并提供智能凑单加购建议。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[投资组合优化](/zh/examples/portfolio-qp)** | Convex QP | HiGHS | `m.continuous()`, `m.constraint()`, `dot()`, `QuadExpr` | 在目标收益率约束下，使用 `QuadExpr` 最小化马科维茨均值-方差风险（$w^T \Sigma w$）。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |
| **[安全策略验证](/zh/examples/smt-security)** | SMT Logic | Z3 | `m.bool()`, `m.constraint()`, `m.check()` | 命题布尔变量（`BoolVar`）与逻辑连接词（`implies`, `and`, `not`, `xor`）及整数边界的混合建模。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[不可行冲突诊断 (`unsatCore`)](/zh/examples/unsat-core)** | Unsat Core | Z3 | `m.constraint()`, `m.check()`, `m.unsatCore` | 当人员配备要求与预算规则互相矛盾时，自动提取冲突约束子集（`unsatCore`）。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |

## 按 WaSHI API 查找（反向索引）

想查找某个特定建模方法或求解器功能的用法？可直接跳转到演示该功能的示例页面：

| 功能 / API | 用途说明 | 示例页面 | Node.js 源码 |
| :--- | :--- | :--- | :--- |
| ``m.constraint(expr`...`)`` | 标签模板字面量直观定义约束 | [生产计划问题](/zh/examples/production) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 一维键值字典形式的索引变量 | [0-1 背包问题](/zh/examples/knapsack) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 二维矩阵形式的索引变量 | [运输与分配网络](/zh/examples/transportation), [员工排班与冲突诊断](/zh/examples/shift-scheduling) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `dot(matrix, vars2d)` / `dot(vector, vars)` | 高效向量/矩阵点积与线性组合 | [运输与分配网络](/zh/examples/transportation), [投资组合优化](/zh/examples/portfolio-qp) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` & `constr.slack` | 影子价格（对偶值）与约束松弛量 | [营养问题与灵敏度分析](/zh/examples/diet-sensitivity) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | LP 中变量的缩减成本 | [营养问题与灵敏度分析](/zh/examples/diet-sensitivity) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | Big-M 条件指示约束（`binVar => constr`） | [购物车优惠券最优组合](/zh/examples/ecommerce-coupons) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | 凸二次目标函数（$x^T Q x$） | [投资组合优化](/zh/examples/portfolio-qp) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.bool()` & `.implies()` | 命题逻辑与 SMT 蕴含规则 | [安全策略验证](/zh/examples/smt-security) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` & `m.unsatCore` | 可满足性检查与冲突约束诊断 | [不可行冲突诊断](/zh/examples/unsat-core), [员工排班与冲突诊断](/zh/examples/shift-scheduling) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) |
| `solver: "glpk"` | 使用 GLPK 插件求解 LP/MIP | [GLPK 求解器指南](/zh/solvers/glpk) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

## 在本地（Node.js）运行示例

所有独立脚本均位于仓库的 [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) 目录下，克隆仓库并安装依赖后可通过 `npx tsx` 直接运行：

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
```
