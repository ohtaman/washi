# 车辆路径规划问题 (列生成法求解CVRP)

| 问题分类 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="/zh/guide/decomposition">分解算法指南</a></li></ul> |

**有容量限制的车辆路径规划问题 (Capacitated Vehicle Routing Problem, CVRP)** 是物流与供应链优化中的经典组合优化问题。目标是在满足车辆载重容量、单车最大途经网点数及路线限制时间（最大工作时长）的前提下，求得服务所有客户的最少车队车辆数。

在实际工业物流中，该定式化遵循经典的 **先聚类后路径（Cluster-First, Route-Second）** 范式：利用列生成法在多资源约束（载重、网点数、时长）下将客户最优划分为可行的车辆组（聚类），各组内的具体行进顺序随后可通过旅行商问题（TSP）等算法快速确定。

在朴素的单一 MIP 模型中，穷举所有可能的客户子集（路线候选）会导致 0-1 二进制变量呈指数级爆炸（$O(2^n)$），即便是中等规模的停靠点也会导致分支定界求解器停滞。

采用 **列生成法 (Dantzig-Wolfe 分解)**，我们无需预先穷举所有路线：
1. **主问题 (Restricted Master Problem, RMP)**：求解集合覆盖（Set Covering）问题，从已生成的候选路线中选择最优组合，确保每个客户至少被服务一次。
2. **定价子问题 (Pricing Subproblem)**：读取主问题中客户访问约束的 **对偶影子价格 (shadow prices / duals)**，动态发现兼具载重容量、网点上限与时长限制、且能最大幅度改善主问题目标函数（具有负检验数/负检验费用）的高效率新路线。

## 问题输入与现实运营约束

配送中心服务 **5 个客户**，需同时满足现实业务中的 **3 项关键运营约束**：
- **车辆载重容量**：每辆车最多装载 **8 单位** 货物。
- **最大途经网点数**：出于司机作业负荷考量，每条路线最多服务 **3 个客户**。
- **路线最大限制时间**：单车行驶耗时与卸货作业耗时总和不超过 **180 分钟 (3小时)**。

| 客户 | 配送需求量 | 卸货作业耗时 | 配送中心往返耗时 | 路线综合耗时 |
| :--- | :---: | :---: | :---: | :---: |
| **客户 1 (C1)** | 4 units | 30分钟 | 20分钟 | 50分钟 |
| **客户 2 (C2)** | 3 units | 25分钟 | 30分钟 | 55分钟 |
| **客户 3 (C3)** | 5 units | 40分钟 | 15分钟 | 55分钟 |
| **客户 4 (C4)** | 2 units | 20分钟 | 25分钟 | 45分钟 |
| **客户 5 (C5)** | 4 units | 35分钟 | 20分钟 | 55分钟 |

- 客户总需求量：$4 + 3 + 5 + 2 + 4 = 18$ 单位。
- 理论最少车辆数下界：$\lceil 18 / 8 \rceil = 3$ 辆。

## 在 WaSHI 中的实现

点击下方的 **▶ Run**，即可在浏览器中交互式求解该 CVRP 问题。通过 WaSHI 的 `sum()` 辅助函数和 `expr` 模板，免去低效冗长的累加循环与手动表达式构建，代码清晰直观：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // 运营约束参数
  const vehicleCapacity = 8;  // 载重容量上限 (units)
  const maxStops = 3;         // 单车最大服务网点数
  const maxRouteTime = 180;   // 路线最大允许时长 (分钟)

  const customers = [
    { id: "C1", demand: 4, serviceTime: 30, transitTime: 20 },
    { id: "C2", demand: 3, serviceTime: 25, transitTime: 30 },
    { id: "C3", demand: 5, serviceTime: 40, transitTime: 15 },
    { id: "C4", demand: 2, serviceTime: 20, transitTime: 25 },
    { id: "C5", demand: 4, serviceTime: 35, transitTime: 20 },
  ];

  // 1. 构建限制性主问题 (Restricted Master Problem, RMP)
  const master = new Model("CVRP_FleetMaster");

  // 初始朴素路线：每个客户专属一台车辆
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));

  // 目标函数：最小化总车辆数
  master.objective(minimize(sum(initialRoutes)));

  // 客户覆盖约束：每个客户至少被一条路线服务
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }
  const visitConstrs = master.constraints;

  console.log("初始状态：5 条单点朴素路线 (5 台车)。");
  console.log("正在使用列生成法 (Dantzig-Wolfe 分解) 求解...");

  // 2. 列生成法求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 定价子问题：直接通过主问题各约束的 .dual 属性获取对偶影子价格，
      // 动态生成满足容量、网点上限与时间限制的最优路线
      const sub = new Model("RoutePricing");

      const visitVars = Object.fromEntries(
        customers.map((c) => [c.id, sub.binary(`v_${c.id}`)])
      );

      // 直接从约束对象 .dual 获取影子价格并最大化收益
      sub.objective(
        maximize(sum(customers, (c, i) => visitVars[c.id].mul(visitConstrs[i].dual ?? 0)))
      );

      // 资源约束 1：车辆装载容量上限
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 资源约束 2：单车最大服务客户数
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id])} <= ${maxStops}`
      );

      // 资源约束 3：路线耗时上限 (行驶耗时 + 卸货耗时)
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.transitTime + c.serviceTime))} <= ${maxRouteTime}`
      );

      await sub.solve();

      const coefficients = {};
      const visited = [];
      for (const c of customers) {
        if (Math.round(visitVars[c.id].value ?? 0) === 1) {
          coefficients[`visit_${c.id}`] = 1;
          visited.push(c.id);
        }
      }

      return {
        cost: 1, // 每条路线使用 1 辆车
        type: "Binary",
        coefficients,
        meta: { visitedCustomers: visited },
      };
    },
    onIteration: (info) => {
      console.log(
        `迭代 ${info.iteration}: LP连续松弛目标值 = ${info.relaxationObjective?.toFixed(2)}, 新增路线列 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\n求解状态: ${result.status}`);
  console.log(`最优车队规模: ${result.objectiveValue} 辆`);
  console.log(`动态生成路线列总数: ${result.columnsAdded}`);

  console.log("\n最优配送计划中选中的路线:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (途经客户: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 核心设计要点

1. **利用 `sum()` 与 `expr` 声明式表达多资源约束**：借助 WaSHI 的 `sum()` 辅助函数与 `expr` 模板标签，无需手动拼接低阶线性表达式（`LinExpr`、`addTerm`），即可将容量、停靠上限与耗时等多维业务约束表达得极其简洁。
2. **直接通过 `.dual` 读取约束对偶影子价格**：在线性规划松弛求解后，主问题的对偶影子价格会自动同步至每个 `Constraint` 对象的 `.dual` 属性中，无需调用包装查找函数，直接属性访问即可。
3. **解元数据解耦**：利用 `meta: { visitedCustomers: visited }` 字段，可直接将途经停靠点等领域对象附加至新生成的列中，求解完成后无需解析变量名即可还原业务信息。
