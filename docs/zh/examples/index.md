# 实际案例与 API 功能索引

本页汇总了 WaSHI 的数理优化与逻辑建模示例。每个案例均可在[交互式网页 Demo](https://ohtaman.github.io/washi/demo/) 中直接在线运行，也可在本地通过 [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) 独立运行。

---

## 1. 基础模型（核心建模 API）

| 案例 | 问题类型 | 核心 API | 演示内容 | 在线试玩 |
| :--- | :--- | :--- | :--- | :--- |
| **[生产计划问题](/examples/production)** | LP / MIP | `addVar()`, `expr`, `c` | 决策变量、模板字符串表达式与资源约束下的利润最大化。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 背包问题](/examples/knapsack)** | Binary MIP | `addVars(keys)`, `sum()` | 一维 `Binary` 变量字典与 `sum()` 聚合。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[运输与分配网络](/examples/transportation)** | LP | `addVars(rows, cols)`, `sum()` | 二维矩阵变量 `ship[factory][store]` 与供需平衡约束。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[营养问题与灵敏度分析](/examples/diet-sensitivity)** | LP | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解后读取影子价格（瓶颈识别）、松弛变量与缩减成本。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |

---

## 2. 实战应用案例

| 案例 | 问题类型 | 求解器 | 演示内容 | 在线试玩 |
| :--- | :--- | :--- | :--- | :--- |
| **[员工排班与冲突诊断](/examples/shift-scheduling)** | Binary MIP + Unsat Core | HiGHS + Z3 | 生成满足每日人数、主管值班、排班上限与休假申请的周排班表，并用 Z3 `unsatCore` 诊断休假冲突。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[购物车优惠券最优组合](/examples/ecommerce-coupons)** | Indicator MIP | HiGHS | 使用 `addIndicator()` 建模满减门槛、互斥规则与凑单推荐。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[投资组合优化](/examples/portfolio-qp)** | Convex QP | HiGHS | 使用 `QuadExpr` 最小化马科维茨协方差风险。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |

---

## 3. SMT 逻辑与冲突诊断 (Z3)

| 案例 | 问题类型 | 求解器 | 演示内容 | 在线试玩 |
| :--- | :--- | :--- | :--- | :--- |
| **[安全策略验证](/examples/smt-security)** | SMT Logic | Z3 | 布尔变量（`BoolVar`）与逻辑连接词（`implies`, `and`, `not`, `xor`）。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[不可行冲突诊断 (`unsatCore`)](/examples/unsat-core)** | Unsat Core | Z3 | 当业务规则互相矛盾时，提取冲突约束子集（`unsatCore`）。 | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |
