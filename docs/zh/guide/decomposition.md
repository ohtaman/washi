# 高级分解方法与最佳实践（列生成法与 Benders 分解）

在混合整数规划（MIP）中，对称性或耦合约束等结构特征可能导致单体建模（Monolithic Formulation）的分支定界搜索树过大，从而影响求解速度。
WaSHI 提供了分解编排器（`master.solveColumnGeneration` 与 `master.solveBenders`）以及用于读取对偶信息和动态修改模型的底层原语。

---

## 为什么需要分解法？（单体 MIP 的瓶颈）

单体 MIP 建模在以下两类问题结构中容易遇到瓶颈：

| 问题结构与特征 | 单体 MIP 瓶颈 | 分解方法 | WaSHI API |
| :--- | :--- | :--- | :--- |
| **对称性与松弛界较弱**<br>*(下料问题 Cutting Stock、车辆路径 VRP、排班/机组轮班)* | 存在大量对称排列且连续松弛界较弱，导致分支定界搜索树扩大。 | **列生成法**<br>*(Dantzig-Wolfe 分解)* | [`master.solveColumnGeneration()`](#列生成法-solvecolumngeneration) |
| **耦合变量与多阶段决策结构**<br>*(旅行商问题/TSP、两阶段选址配送、两阶段随机规划)* | 一阶段主决策与大量子场景或运营变量耦合，导致矩阵规模增大。 | **Benders 分解**<br>*(Benders 割平面法)* | [`master.solveBenders()`](#benders-分解-solvebenders) |

---

## 基础原语

WaSHI 提供细粒度的建模原语，用于获取对偶信息与动态修改模型：

### 1. 约束对偶值（`dual`）
求解线性规划（LP）后，可获取约束右端常数项（RHS）变化时的边际效益：

```typescript
m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

const c = m.getConstraintByName("capacity")!;
console.log(c.dual); // 对偶变量值 / 影子价格
console.log(m.solution?.duals.capacity);
```

### 2. 连续 LP 松弛求解（`model.relax()`）
分解算法依赖连续松弛的对偶变量。`model.relax()` 会在变量界限内临时将所有 `Integer` 和 `Binary` 决策变量松弛为连续变量进行求解：

```typescript
// 求解 LP 松弛并提取影子价格至 m.solution.duals
const status = await m.relax();
console.log("理论对偶界限:", m.objectiveValue);
```

### 3. 动态列注入（`model.addColumn()`）
单次调用即可同时创建新决策变量、设置目标函数系数并绑定到既有约束矩阵：

```typescript
const col = m.addColumn({
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

### 基于 `pricing` 回调的列生成

传入 `pricing` 回调函数，获取约束影子价格（对偶值），求解定价子问题（可使用 WaSHI 模型或任意专用算法），并返回生成的列方案。WaSHI 会自动评估检验数并将有效改进列注入主问题：

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. 构建受限主问题（RMP），使用常规变量定义朴素初始切割方案
const master = new Model("CuttingStockMaster");

const pA = master.integer("init_A", { lb: 0 }); // 方案A：每卷切2个A（45*2 = 90 <= 100）
const pB = master.integer("init_B", { lb: 0 }); // 方案B：每卷切2个B（36*2 = 72 <= 100）
const pC = master.integer("init_C", { lb: 0 }); // 方案C：每卷切6个C（16*6 = 96 <= 100）

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
master.constraint(expr`6 * ${pC} >= 20`, "demand_C");
const [demandA, demandB, demandC] = master.constraints;

// 2. 调用 master.solveColumnGeneration() 求解
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // 定价子问题（背包问题）
    const sub = new Model("KnapsackPricing");
    const a_A = sub.integer("a_A", { lb: 0, ub: 2 });
    const a_B = sub.integer("a_B", { lb: 0, ub: 2 });
    const a_C = sub.integer("a_C", { lb: 0, ub: 6 });

    // 最大化对偶奖励
    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
    sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`);

    await sub.solve();

    // 返回生成的切割模式
    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(a_A.value ?? 0),
        demand_B: Math.round(a_B.value ?? 0),
        demand_C: Math.round(a_C.value ?? 0),
      },
    };
  },
});

console.log("最优总卷数:", result.objectiveValue); // 14
console.log("迭代次数:", result.iterations);
console.log("动态生成列数:", result.columnsAdded);
```

### 结合自定义图算法 / 动态规划求解子问题

由于 `pricing` 是标准回调函数，你可以自由使用 Dijkstra 最短路、动态规划或自定义启发式求解子问题：

```typescript
const result = await master.solveColumnGeneration({
  pricing: async ({ getDual }) => {
    // 专用的网络图算法求解最优路径
    const route = solveSpecializedShortestPath(getDual);
    if (!route) return null;

    return {
      cost: route.distance,
      type: "Integer",
      coefficients: route.visitedCustomers,
    };
  },
});
```

---

## Benders 分解（`solveBenders`）

Benders 分解将问题划分为：
- **主问题（Master Problem）**：包含耦合决策变量（如 0-1 投资变量 $y$）及辅助估计变量 $\theta \ge 0$。
- **子问题（Subproblem）**：在固定主问题解的前提下求解运营子问题，动态生成**最优性割平面（Optimality Cut）**反馈给主问题，直至收敛。

### 推荐：子问题模型与 `link()` 自动割平面生成

子问题回调返回子问题 `Model` 并使用 `sub.link(...)` 声明与主问题变量的耦合关系时，WaSHI 会自动管理 $\theta$、提取对偶值并注入 Benders 最优性割平面：

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

// 2. 调用 master.solveBenders() 求解
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

    // 使用 link 指定与主问题决策变量的耦合
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // 返回模型后自动生成割平面并管理 theta
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
  subproblem: async () => {
    const open1 = y1.value ?? 0;
    const open2 = y2.value ?? 0;
    const estTheta = theta.value ?? 0;

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      return {
        kind: "optimality",
        constraint: expr`${theta} - 50 * ${sub.solution!.duals.cap1} * ${y1} - 60 * ${sub.solution!.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // 收敛
  },
});
```

---

## 应用示例

分解方法在组合优化中的两个典型应用示例：

### 1. 车辆路径问题（CVRP: 容量限制车辆路径） $\times$ 列生成法
*(完整可执行代码: [`examples/node/13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts))*

* **问题结构**: 多车巡回配送客户时，预先枚举所有可能路线会产生大量变量。
* **列生成法建模**:
  * **主问题（集合覆盖）**: 从已生成的路线候选中，选择覆盖所有客户且总车辆数最少的路线组合。
  * **定价子问题（背包问题）**: 基于客户约束的影子价格（对偶变量），动态生成满足车辆载重限制且具有负检验数的可行路线（列）。

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const vehicleCapacity = 8;
const customers = [
  { id: "C1", demand: 4 },
  { id: "C2", demand: 3 },
  { id: "C3", demand: 5 },
  { id: "C4", demand: 2 },
  { id: "C5", demand: 4 },
];

// 1. 主问题：客户覆盖
const master = new Model("CVRP_Master");
const initialRoutes: Var[] = [];
for (const cust of customers) {
  initialRoutes.push(master.integer(`init_${cust.id}`, { lb: 0, ub: 1 }));
}
master.objective(minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr())));

for (let i = 0; i < customers.length; i++) {
  master.constraint(expr`${initialRoutes[i]} >= 1`, `visit_${customers[i].id}`);
}
const visitConstrs = master.constraints;

// 2. 列生成法求解
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    const sub = new Model("RoutePricing");
    const a: Record<string, Var> = {};
    const obj = new LinExpr();

    for (let i = 0; i < customers.length; i++) {
      const cust = customers[i];
      a[cust.id] = sub.binary(`v_${cust.id}`);
      obj.addTerm(a[cust.id], visitConstrs[i].dual ?? 0);
    }

    sub.objective(maximize(obj));

    // 车辆载重约束: sum(demand_i * a_i) <= vehicleCapacity
    const load = customers.reduce((acc, c) => acc.add(a[c.id].mul(c.demand)), new LinExpr());
    sub.constraint(expr`${load} <= ${vehicleCapacity}`);

    await sub.solve();

    const coefficients: Record<string, number> = {};
    for (const cust of customers) {
      coefficients[`visit_${cust.id}`] = Math.round(a[cust.id].value ?? 0);
    }

    return {
      cost: 1,
      type: "Integer",
      coefficients,
    };
  },
});

console.log("最优车队规模:", result.objectiveValue); // 3 辆车
```

### 2. 旅行商问题（TSP） $\times$ Benders 分解（延迟割平面消除子回路）
*(完整可执行代码: [`examples/node/14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts))*

* **问题结构**: 消除子回路约束（SECs）的数量随城市数 $n$ 呈 $O(2^n)$ 增长，无法预先全部加入模型。
* **Benders 分解建模（DFJ 延迟割平面法）**:
  * **主问题**: 仅求解每个城市入度与出度各为 1 的基础指派松弛问题。
  * **子问题**: 检查解路径的连通分量。若存在孤立子回路 $S$，动态生成一条禁止该子回路的 Benders 可行性割平面（$\sum_{i,j \in S} x_{ij} \le |S| - 1$）反馈给主问题。

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const n = cities.length;
const master = new Model("TSP_Master");
const x: Record<string, Var> = {};
const objExpr = new LinExpr();

for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      const v = master.binary(`x_${i}_${j}`);
      x[`${i}_${j}`] = v;
      objExpr.addTerm(v, dist(i, j));
    }
  }
}
master.objective(minimize(objExpr));

// 城市出度与入度约束
for (let i = 0; i < n; i++) {
  const outE = new LinExpr();
  const inE = new LinExpr();
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      outE.addTerm(x[`${i}_${j}`], 1);
      inE.addTerm(x[`${j}_${i}`], 1);
    }
  }
  master.constraint(expr`${outE} == 1`, `out_${i}`);
  master.constraint(expr`${inE} == 1`, `in_${i}`);
}

// Benders 延迟消除子回路求解
const result = await master.solveBenders({
  subproblem: () => {
    const cycles = findCycles(n, (i, j) => (x[`${i}_${j}`].value ?? 0) > 0.5);
    if (cycles.length === 1 && cycles[0].length === n) {
      return null; // 已形成覆盖所有城市的单一回路
    }

    // 发现子回路：为最小局部回路 S 生成 Benders 可行性割平面
    const S = cycles.reduce((min, c) => (c.length < min.length ? c : min), cycles[0]);
    const secExpr = new LinExpr();
    for (const i of S) {
      for (const j of S) {
        if (i !== j) secExpr.addTerm(x[`${i}_${j}`], 1);
      }
    }
    return {
      kind: "feasibility",
      constraint: expr`${secExpr} <= ${S.length - 1}`,
    };
  },
});
```
