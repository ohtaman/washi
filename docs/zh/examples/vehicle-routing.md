# 车辆路径规划问题 (CVRP: 列生成法)

| 问题类型 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**带容量限制的车辆路径问题（CVRP: Capacitated Vehicle Routing Problem）** 是物流与供应链优化中最核心的组合难题：在满足每个客户的配送需求与车辆载重上限的前提下，求服务所有客户所需的最少车队规模（或最小运行总成本）。

如果尝试在单体 MIP 中枚举所有可能的路径组合，变量规模将呈指数级爆炸（$O(2^n)$），导致分支定界法在中小规模下即陷入停滞。

利用**列生成法（Dantzig-Wolfe 分解）**，无需预先枚举全部路径：
1. **受限主问题（RMP）**：从简单的初始路径集（如每位客户分配一台专属车辆）出发，选择满足全员配送的最优路径组合。
2. **定价子问题（Pricing Subproblem）**：根据主问题各客户覆盖约束的**影子价格（对偶值）**，在车辆载重上限内动态寻找整合多位客户的高价值新路径。

## 问题输入数据

考虑 **5 位客户** 的配送需求与载重 **8 单位** 的车队：

| 客户 | 配送需求量 | 车辆载重上限 |
| :--- | :---: | :---: |
| **客户 1 (C1)** | 4 单位 | 8 单位 |
| **客户 2 (C2)** | 3 单位 | 8 单位 |
| **客户 3 (C3)** | 5 单位 | 8 单位 |
| **客户 4 (C4)** | 2 单位 | 8 单位 |
| **客户 5 (C5)** | 4 单位 | 8 单位 |

- 客户总需求量：$4 + 3 + 5 + 2 + 4 = 18$ 单位
- 理论最少车辆数下界：$\lceil 18 / 8 \rceil = 3$ 辆

## WaSHI 建模实现

点击下方的 **▶ 运行（Run）** 按钮，可在浏览器内直接启动求解器，交互式观察动态生成路径列与确定最优车队的完整过程：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, LinExpr } from "@ohtaman/washi";

async function runCVRP() {
  const vehicleCapacity = 8;
  const customers = [
    { id: "C1", demand: 4 },
    { id: "C2", demand: 3 },
    { id: "C3", demand: 5 },
    { id: "C4", demand: 2 },
    { id: "C5", demand: 4 },
  ];

  // 1. 构建受限主问题（RMP）
  const master = new Model("CVRP_FleetMaster");

  // 初始路径：每位客户分配单车专送的朴素可行解
  const initialRoutes = [];
  for (const cust of customers) {
    const r = master.binary(`route_init_${cust.id}`);
    initialRoutes.push(r);
  }

  // 目标函数：最小化总车辆数
  master.objective(
    minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr()))
  );

  // 客户覆盖约束：每位客户至少被一条路径访问
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }

  console.log("初始状态：5 条单客专送路径（共 5 台车）");
  console.log("启动列生成迭代求解...");

  // 2. 调用列生成算法求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // 定价子问题：根据主问题对偶价格，在载重上限内寻找收益最高的新路径
      const sub = new Model("RoutePricing");

      const visitVars = {};
      const obj = new LinExpr();

      for (const cust of customers) {
        visitVars[cust.id] = sub.binary(`v_${cust.id}`);
        const dual = getDual(`visit_${cust.id}`);
        obj.addTerm(visitVars[cust.id], dual);
      }

      // 最大化收集到的对偶收益
      sub.objective(maximize(obj));

      // 背包载重约束：sum(demand_i * v_i) <= vehicleCapacity
      const loadExpr = customers.reduce(
        (acc, cust) => acc.add(visitVars[cust.id].mul(cust.demand)),
        new LinExpr()
      );
      sub.constraint(expr`${loadExpr} <= ${vehicleCapacity}`);

      await sub.solve();

      const coefficients = {};
      const visited = [];
      for (const cust of customers) {
        if (Math.round(visitVars[cust.id].value ?? 0) === 1) {
          coefficients[`visit_${cust.id}`] = 1;
          visited.push(cust.id);
        }
      }

      return {
        cost: 1, // 每条路径消耗 1 台车辆
        type: "Binary",
        coefficients,
        meta: { visitedCustomers: visited },
      };
    },
    onIteration: (info) => {
      console.log(
        `Iter ${info.iteration}: LP松弛目标值 = ${info.relaxationObjective?.toFixed(2)}, 新增列数 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\n求解状态: ${result.status}`);
  console.log(`最优车辆数: ${result.objectiveValue} 辆`);
  console.log(`生成路径总数: ${result.columnsAdded}`);

  console.log("\n最优车队入选路径:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (访问客户: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 核心要点

1. **自然建模语法**：主问题完全采用常规的 `master.binary()` 与 `master.constraint()` 直接定义初始可行解，无需前置虚拟占位或低阶列定义。
2. **直观的 `pricing` 回调**：子问题通过 `getDual("visit_C1")` 获取对偶值，求解背包模型后以 `{ coefficients: { visit_C1: 1, ... } }` 格式直接返回即可。
3. **`meta` 还原业务解**：在 `meta: { visitedCustomers: visited }` 中挂载领域对象，求解后即可从 `result.generatedColumns` 提取完整的路径停靠清单。
