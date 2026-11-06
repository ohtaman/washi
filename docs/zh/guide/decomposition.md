# 高级分解方法与最佳实践（列生成法与 Benders 分解）

混合整数规划（MIP）功能非常通用，但普通的单体建模（Monolithic Formulation）存在众所周知的结构瓶颈：在某些特定问题结构下，标准分支定界算法的搜索树会发生指数级膨胀，导致求解器长时间停滞或超时。
WaSHI 提供了运筹学（OR）领域公认的最佳实践分解原语以及高级编排器（`solveColumnGeneration` 与 `solveBenders`），让非运筹学专家也能轻松利用这些强大方法。

---

## 为什么需要分解法？（单体 MIP 何时会失效）

通用 MIP 求解器难以高效处理的两大经典问题结构如下：

| 问题结构与特征 | 单体 MIP 失效原因 | 运筹学最佳实践 | WaSHI API |
| :--- | :--- | :--- | :--- |
| **高度对称性与松弛界较弱**<br>*(下料问题 Cutting Stock、装箱 Bin Packing、车辆路径 VRP、排班/机组轮班)* | 存在大量对称排列，连续松弛界过弱，导致分支定界搜索树急剧膨胀。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **耦合变量与多阶段决策结构**<br>*(随机规划、两阶段选址配送、容量投资规划)* | 耦合一阶段主决策与海量子场景/运营变量，导致矩阵规模过大。 | **Benders 分解**<br>*(Benders 割平面法)* | [`solveBenders()`](#benders-分解-solvebenders) |

---

## 基础原语

WaSHI 提供细粒度的建模原语，用于获取对偶信息与动态修改模型：

### 1. 约束对偶值 / 影子价格（`dual` / `shadowPrice`）
求解线性规划（LP）后，可获取约束右端常数项（RHS）变化时的边际效益：

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);        // 对偶变量值（影子价格）
console.log(c.shadowPrice); // c.dual 的别名
console.log(m.solution.duals.capacity);
```

### 2. 连续 LP 松弛求解（`model.relax()`）
分解算法依赖连续松弛的对偶变量。`model.relax()` 会在变量界限内临时将所有 `Integer` 和 `Binary` 决策变量松弛为连续变量进行求解：

```typescript
// 求解 LP 松弛并提取影子价格至 m.solution.duals
const status = await m.relax();
console.log("理论对偶界限:", m.objectiveValue);
```

### 3. 动态列注入（`model.column()`）
单次调用即可同时创建新决策变量、设置目标函数系数并绑定到既有约束矩阵：

```typescript
const col = m.column({
  name: "pattern_1",
  type: "Integer", // 或 "Continuous"
  lb: 0,
  cost: 1, // 目标函数系数
  coefficients: {
    demand_itemA: 2,
    demand_itemB: 1,
  },
});
```

### 4. 约束项动态修改（`addTerm` / `setTerm`）
动态增减或修改既有约束中特定变量的系数：

```typescript
const c = m.getConstraintByName("budget")!;
c.addTerm(newVar, 5); // 将 newVar 的系数增加 5
c.setTerm(newVar, 0); // 设为 0 时安全移除该项
```

---

## 列生成法（`solveColumnGeneration`）

列生成法从包含少量初始列的**受限主问题（Restricted Master Problem, RMP）**开始，自动循环以下流程：
1. 通过 `master.relax()` 求解受限主问题的连续 LP 松弛。
2. 将约束对偶值（影子价格）传递给用户的 `pricing` 定价子问题回调函数。
3. 定价子问题寻找检验数（Reduced Cost）为负的改进列（$\bar{c} = \text{cost} - \sum \pi_i a_i < 0$）。
4. 动态将改进列加入受限主问题，直至无法找到新列。
5. 最终求解含全部生成列的整数规划（MIP），得到整数解。

---

## Benders 分解（`solveBenders`）

Benders 分解将问题划分为：
- **主问题（Master Problem）**：包含耦合决策变量（如 0-1 投资变量 $y$）及辅助估计变量 $\theta \ge 0$。
- **子问题回调（Subproblem Callback）**：在固定主问题解的前提下求解运营子问题，动态生成**最优性割平面（Optimality Cut）**或**可行性割平面（Feasibility Cut）**反馈给主问题，直至收敛。
