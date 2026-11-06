# 高级分解方法与最佳实践（列生成法与 Benders 分解）

混合整数规划（MIP）功能非常通用，但普通的单体建模（Monolithic Formulation）存在众所周知的结构瓶颈：在某些特定问题结构下，标准分支定界算法的搜索树会发生指数级膨胀，导致求解器长时间停滞或超时。
WaSHI 提供了运筹学（OR）领域公认的最佳实践分解原语以及高级编排器（`master.solveColumnGeneration` 与 `master.solveBenders`），让非运筹学专家也能通过直接返回子问题模型轻松利用这些强大方法。

---

## 为什么需要分解法？（单体 MIP 何时会失效）

通用 MIP 求解器难以高效处理的两大经典问题结构如下：

| 问题结构与特征 | 单体 MIP 失效原因 | 运筹学最佳实践 | WaSHI API |
| :--- | :--- | :--- | :--- |
| **高度对称性与松弛界较弱**<br>*(下料问题 Cutting Stock、车辆路径 VRP、排班/机组轮班)* | 存在大量对称排列，连续松弛界过弱，导致分支定界搜索树急剧膨胀。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **耦合变量与多阶段决策结构**<br>*(旅行商问题/TSP、两阶段选址配送、两阶段随机规划)* | 耦合一阶段主决策与海量子场景/运营变量，导致矩阵规模过大。 | **Benders 分解**<br>*(Benders 割平面法)* | [`master.solveBenders()`](#benders-分解-solvebenders) |

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
2. 依据约束对偶值（影子价格）求解定价子问题。
3. 寻找检验数（Reduced Cost）为负的改进列（$\bar{c} = \text{cost} - \sum \pi_i a_i < 0$）并动态加入主问题。
4. 重复直至无法找到新列。
5. 最终求解含全部生成列的整数规划（`finalizeAsMIP`，默认 `true`），得到精确整数解。

### 推荐：子问题模型与 `linkColumn()` 全自动列生成

子问题回调只需返回子问题 `Model` 并使用 `sub.linkColumn(...)` 声明与主问题约束的绑定关系，WaSHI 将全自动设置对偶目标函数、求解子问题、判断检验数并注入新列：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. 构建受限主问题（RMP）
const master = new Model("CuttingStockMaster");
master.objective(minimize(0));

for (const item of items) {
  master.constraint(expr`0 >= ${item.demand}`, `demand_${item.id}`);
}

// 注册简单初始列（单项切割方案）
master.column({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. 调用 master.solveColumnGeneration() 全自动求解（直接返回 sub 即可！）
const result = await master.solveColumnGeneration({
  subproblem: () => {
    // 定价子问题（背包问题）
    const sub = new Model("KnapsackPricing");
    const a = {
      A: sub.integer("a_A", { lb: 0, ub: 2 }),
      B: sub.integer("a_B", { lb: 0, ub: 2 }),
      C: sub.integer("a_C", { lb: 0, ub: 6 }),
    };
    sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

    // 使用 linkColumn 声明子问题变量对主问题各约束的贡献
    sub.linkColumn({
      cost: 1,
      coefficients: {
        demand_A: a.A,
        demand_B: a.B,
        demand_C: a.C,
      },
    });

    return sub; // 直接返回模型，对偶目标函数与列注入全自动处理！
  },
});

console.log("最优总卷数:", result.objectiveValue); // 14
console.log("迭代次数:", result.iterations);
console.log("动态生成列数:", result.columnsAdded);
```

> **Note**: 对于静态子问题，亦可传入声明式对象：`subproblem: { model: sub, mapping: { demand_A: a.A, ... }, cost: 1 }`。

### 低级控制：自定义 `pricing` 回调函数

若定价问题使用专用的图算法（如最短路径），可自定义 `pricing` 回调：

```typescript
const result = await master.solveColumnGeneration({
  pricing: async ({ getDual, reducedCostTolerance }) => {
    const dualA = getDual("demand_A");
    const dualB = getDual("demand_B");
    const dualC = getDual("demand_C");

    const pattern = solveCustomKnapsack(dualA, dualB, dualC);
    const reducedCost = 1 - pattern.dualValue;

    if (reducedCost < -reducedCostTolerance) {
      return {
        cost: 1,
        type: "Integer",
        coefficients: pattern.coefficients,
        reducedCost,
      };
    }
    return null; // 达到最优，迭代结束
  },
});
```

---

## Benders 分解（`solveBenders`）

Benders 分解将问题划分为：
- **主问题（Master Problem）**：包含耦合决策变量（如 0-1 投资变量 $y$）及辅助估计变量 $\theta \ge 0$。
- **子问题（Subproblem）**：在固定主问题解的前提下求解运营子问题，动态生成**最优性割平面（Optimality Cut）**反馈给主问题，直至收敛。

### 推荐：子问题模型与 `linkRow()` 全自动割平面生成

子问题回调只需返回子问题 `Model` 并使用 `sub.linkRow(...)`（或 `sub.link(...)`）声明与主问题变量的耦合关系，WaSHI 将全自动管理 $\theta$、提取对偶值并注入 Benders 最优性割平面：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. 主问题：两阶段设施选址
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// 目标函数：设施固定建设成本（theta 由系统自动管理）
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
// 满足总需求的总体容量校验约束
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "capacity_check");

// 2. 调用 master.solveBenders() 全自动求解
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    // 运营调度子问题（最小化运输成本）
    const sub = new Model("TransportSubproblem");
    const x11 = sub.continuous("x_11", { lb: 0 });
    const x12 = sub.continuous("x_12", { lb: 0 });
    const x13 = sub.continuous("x_13", { lb: 0 });
    const x21 = sub.continuous("x_21", { lb: 0 });
    const x22 = sub.continuous("x_22", { lb: 0 });
    const x23 = sub.continuous("x_23", { lb: 0 });

    sub.objective(
      minimize(
        expr`3 * ${x11} + 4 * ${x12} + 2 * ${x13} + 4 * ${x21} + 2 * ${x22} + 3 * ${x23}`
      )
    );

    // 客户需求约束
    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // 使用 linkRow (行链接) 指定与主问题决策变量的耦合
    sub.linkRow(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.linkRow(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // 直接返回模型，割平面生成与 theta 管理全自动完成！
  },
});

console.log("最优总成本:", result.objectiveValue); // 390
console.log("迭代次数:", result.iterations);
console.log("添加割平面数:", result.cutsAdded);
console.log("设施选址决策:", {
  F1: result.values.open_F1,
  F2: result.values.open_F2,
});
```

### 低级控制：自定义 `BendersCut` 回调

若需手动构造割平面，回调亦可直接返回 `BendersCut` 对象：

```typescript
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: async ({ getMasterValue }) => {
    const open1 = getMasterValue(y1);
    const open2 = getMasterValue(y2);
    const estTheta = getMasterValue("theta");

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      return {
        kind: "optimality",
        constraint: expr`theta - 50 * ${sub.solution.duals.cap1} * ${y1} - 60 * ${sub.solution.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // 收敛
  },
});
```

---

## 运筹学实战杀手级应用

分解法在运筹学工业级实战中的两大经典应用场景：

### 1. 车辆路径问题（VRP: Vehicle Routing Problem） $\times$ 列生成法
* **核心难点**: 多车巡回配送客户时，排列所有可能路线将产生数亿级变量，单体 MIP 会直接耗尽内存。
* **列生成法解法**:
  * **主问题（集合覆盖/划分）**: 从已生成的路线候选中，选择访问所有客户且总成本/车辆数最小的路线组合。
  * **子问题（定价/带资源约束最短路径）**: 单独生成一条满足车辆载重与时间窗的有望可行路线（一条路线＝一列！）。
  * **成效**: 无需预先枚举天文数字的路径，子问题**动态按需生成改进路线（列）**，在几秒内求解大规模配送调度。

### 2. 旅行商问题（TSP） $\times$ Benders 分解（延迟割平面消除子回路）
* **核心难点**: 为防止路线分裂为局部小岛回路，消除子回路约束（Subtour Elimination Constraints）的数量随城市数 $n$ 呈 **$O(2^n)$ 指数级膨胀**，无法全部预先加入模型。
* **Benders 分解解法**:
  * **主问题**: 仅求解每个城市入度与出度各为 1 的基础松弛问题。
  * **子问题**: 检查解路径是否存在孤立子回路。若存在，生成一条禁止该子回路的 Benders 割平面（行！）反馈给主问题。
  * **成效**: 仅需动态生成极少数实际违反的割平面（行），即可瞬间优化超大规模旅行商网络。

---

## 与 `master.solve()` 语法统一

`master.solveBenders(...)` 与 `master.solveColumnGeneration(...)` 亦可通过 WaSHI 标准的 `master.solve()` options 进行调用：

```typescript
// Benders 分解
const status = await master.solve({
  benders: {
    gapTolerance: 1e-4,
    subproblem: () => {
      // ...
      sub.linkRow(expr`${x} <= 50 * ${y}`);
      return sub;
    },
  },
});

// 列生成法
const status = await master.solve({
  columnGeneration: {
    finalizeAsMIP: true,
    subproblem: () => {
      // ...
      sub.linkColumn({ cost: 1, coefficients: { demand_A: a.A } });
      return sub;
    },
  },
});

// 求解后可通过 master.decomposition 查看详细分解结果
console.log(master.decomposition?.iterations);
```
