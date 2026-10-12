# 实际案例与 API 功能索引

本页汇总了 WaSHI 的数理优化与逻辑建模示例。每个案例均可直接在页面内运行，也可在 [Playground](https://ohtaman.github.io/washi/demo/) 中在线编辑运行，或在本地通过 [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) 独立运行。

## 案例一览

| 案例 | 问题类型 | 求解器 | 核心 API | 演示内容 | 代码编辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[生产计划问题](/examples/production)** | LP / MIP | HiGHS | `m.integer()`, `m.constrain()`, `expr` | 决策变量、模板字符串表达式与资源约束下的利润最大化。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 背包问题](/examples/knapsack)** | Binary MIP | HiGHS | `m.binary(keys)`, `sum()`, `m.constrain()` | 一维 `Binary` 变量字典与 `sum()` 聚合。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[运输与分配网络](/examples/transportation)** | LP | HiGHS | `m.continuous(rows, cols)`, `dot()`, `m.constrain()` | 二维矩阵变量 `ship[factory][store]` 与供需平衡约束。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[营养问题与灵敏度分析](/examples/diet-sensitivity)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解后读取影子价格（瓶颈识别）、松弛变量与缩减成本。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |
| **[员工排班与冲突诊断](/examples/shift-scheduling)** | Binary MIP + Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `check()`, `unsatCore` | 生成满足每日人数、主管值班、排班上限与休假申请的周排班表，并用 Z3 `unsatCore` 诊断休假冲突。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[购物车优惠券最优组合](/examples/ecommerce-coupons)** | Indicator MIP | HiGHS | `m.indicator()`, `sum()`, `m.constrain()` | 使用 `m.indicator()` 建模满减门槛、互斥规则与凑单推荐。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[投资组合优化](/examples/portfolio-qp)** | Convex QP | HiGHS | `m.continuous()`, `m.constrain()`, `dot()`, `QuadExpr` | 使用 `QuadExpr` 最小化马科维茨协方差风险。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |
| **[安全策略验证](/examples/smt-security)** | SMT Logic | Z3 | `m.addBoolVar()`, `m.constrain()`, `m.check()` | 布尔变量（`BoolVar`）与逻辑连接词（`implies`, `and`, `not`, `xor`）。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[不可行冲突诊断 (`unsatCore`)](/examples/unsat-core)** | Unsat Core | Z3 | `m.constrain()`, `m.check()`, `m.unsatCore` | 当业务规则互相矛盾时，提取冲突约束子集（`unsatCore`）。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |
