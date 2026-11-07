# 车辆路径规划问题 (列生成法求解CVRP)

| 问题分类 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**有容量限制的车辆路径规划问题 (Capacitated Vehicle Routing Problem, CVRP)** 是物流与供应链优化中的经典组合优化问题。目标是在满足车辆载重容量、单车最大途经网点数及路线限制时间（最大工作时长）的前提下，求得服务所有客户的最少车队车辆数与最优巡回路线。

在朴素的单一 MIP 模型中，穷举所有可能的客户子集与行驶顺序会导致 0-1 二进制变量呈指数级爆炸（$O(2^n)$），即便是中等规模的停靠点也会导致分支定界求解器停滞。

采用 **列生成法 (Dantzig-Wolfe 分解)**，我们无需预先穷举所有路线：
1. **主问题 (Restricted Master Problem, RMP)**：求解集合划分（Set Partitioning）问题，从已生成的候选路线中选择最优组合，确保每个客户恰好被服务一次。
2. **定价子问题 (Pricing Subproblem)**：读取主问题中客户访问约束的 **对偶影子价格 (shadow prices / duals)**，基于网点间距离矩阵，通过网络流守恒与 MTZ 子回路消除约束，动态发现兼具载重容量、网点上限与时长限制的高效率新路线。

## 问题输入与现实运营约束

配送中心位于 $(0, 0)$，服务 **5 个客户**，各客户具有 2D 平面坐标 (km)、配送需求量和卸货作业耗时 (分钟)：

| 网点 | 坐标 $(x, y)$ | 配送需求量 | 卸货作业耗时 |
| :--- | :---: | :---: | :---: |
| **配送中心 (Depot)** | $(0, 0)$ | — | — |
| **客户 1 (C1)** | $(20, 20)$ | 4 units | 30分钟 |
| **客户 2 (C2)** | $(25, -10)$ | 3 units | 25分钟 |
| **客户 3 (C3)** | $(-20, 30)$ | 5 units | 40分钟 |
| **客户 4 (C4)** | $(-15, -25)$ | 2 units | 20分钟 |
| **客户 5 (C5)** | $(30, 15)$ | 4 units | 35分钟 |

- **运营约束**:
  - **车辆载重容量**：每辆车最多装载 **8 单位** 货物。
  - **最大途经网点数**：出于司机作业负荷考量，每条路线最多服务 **3 个客户**。
  - **路线最大限制时间**：单车行驶耗时与卸货作业耗时总和不超过 **180 分钟 (3小时)**。
- **网点间行驶耗时**：根据所有网点间的欧几里得距离矩阵计算（假设平均行进速度为 $1\text{ km/分钟} = 60\text{ km/h}$）。
- 总配送需求量：$4 + 3 + 5 + 2 + 4 = 18$ 单位。
- 理论最少所需车队规模：$\lceil 18 / 8 \rceil = 3$ 辆。

## WaSHI 实现代码

点击下方的 **▶ Run** 即可在浏览器中交互式求解该 CVRP 问题。定价子问题求解包含网络流与 MTZ 消除的真实路径，沿途累加网点间实际行驶时间：

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // 运营约束
  const vehicleCapacity = 8;
  const maxStops = 3;
  const maxRouteTime = 180; // 分钟

  // 配送中心与客户坐标 (km)
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = [
    { id: "C1", x: 20, y: 20, demand: 4, serviceTime: 30 },
    { id: "C2", x: 25, y: -10, demand: 3, serviceTime: 25 },
    { id: "C3", x: -20, y: 30, demand: 5, serviceTime: 40 },
    { id: "C4", x: -15, y: -25, demand: 2, serviceTime: 20 },
    { id: "C5", x: 30, y: 15, demand: 4, serviceTime: 35 },
  ];

  const nodes = [depot, ...customers];
  const n = nodes.length;

  // 网点间行进耗时矩阵 (1 km = 1 分钟)
  const dist = nodes.map((a) =>
    nodes.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y)))
  );

  // 1. 构建限制主问题 (RMP)
  const master = new Model("CVRP_FleetMaster");

  // 初始朴素路线：每个客户专属单车（配送中心 -> 客户 -> 配送中心）
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // 客户访问约束：每个客户恰好被 1 辆车服务
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} == 1`,
      `visit_${customers[i].id}`
    );
  }
  const visitConstrs = master.constraints;

  console.log("初始状态: 5 辆单客户专车 (5 辆)。");
  console.log("列生成法迭代求解中...");

  // 2. 列生成法求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 定价子问题：寻找检验数（负检验费用）小于 0 的新路线：
      // 检验数 = 1 - sum(visit_i * dual_i) < 0 <=> 最大化 sum(visit_i * dual_i) > 1
      const sub = new Model("RoutePricing");

      const y = [];
      for (let i = 1; i < n; i++) y[i] = sub.binary(`y_${i}`);

      const x = [];
      for (let i = 0; i < n; i++) {
        x[i] = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) x[i][j] = sub.binary(`x_${i}_${j}`);
        }
      }

      // 最大化来自主问题约束的对偶影子价格收益
      sub.objective(
        maximize(sum(customers, (c, i) => y[i + 1].mul(visitConstrs[i].dual ?? 0)))
      );

      // 1. 载重容量限制
      sub.constraint(
        expr`${sum(customers, (c, i) => y[i + 1].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 2. 最大停靠站点数限制
      sub.constraint(expr`${sum(customers, (c, i) => y[i + 1])} <= ${maxStops}`);

      // 3. 配送中心进出流守恒
      const leaveDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[0][k + 1]));
      const enterDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[k + 1][0]));
      sub.constraint(expr`${leaveDepot} <= 1`);
      sub.constraint(expr`${enterDepot} == ${leaveDepot}`);

      // 客户节点流守恒 (流入 == 流出 == y_i)
      for (let i = 1; i < n; i++) {
        const inFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[j][i] : undefined)).filter(Boolean)
        );
        const outFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[i][j] : undefined)).filter(Boolean)
        );
        sub.constraint(expr`${inFlow} == ${y[i]}`);
        sub.constraint(expr`${outFlow} == ${y[i]}`);
      }

      // 4. MTZ 子回路消除约束
      const u = [];
      for (let i = 1; i < n; i++) u[i] = sub.continuous(`u_${i}`, { lb: 1, ub: n - 1 });
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          if (i !== j) {
            sub.constraint(expr`${u[i]} - ${u[j]} + ${n} * ${x[i][j]} <= ${n - 1}`);
          }
        }
      }

      // 5. 路线总时长限制 (行进耗时 + 卸货作业耗时 <= 180 分钟)
      const arcTimes = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) arcTimes.push(x[i][j].mul(dist[i][j]));
        }
      }
      const totalTravelTime = sum(arcTimes);
      const totalServiceTime = sum(customers, (c, i) => y[i + 1].mul(c.serviceTime));
      sub.constraint(expr`${totalTravelTime} + ${totalServiceTime} <= ${maxRouteTime}`);

      await sub.solve();

      const dualProfit = sub.solution?.objectiveValue ?? 0;
      if (dualProfit <= 1 + 1e-4) return null;

      const coefficients = {};
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          coefficients[`visit_${customers[i].id}`] = 1;
        }
      }

      // 还原实际行进路径: Depot -> ... -> Depot
      const tour = ["Depot"];
      let curr = 0;
      let travelMins = 0;
      const visitedSet = new Set();
      while (true) {
        let next = -1;
        for (let j = 0; j < n; j++) {
          if (curr !== j && Math.round(x[curr][j].value ?? 0) === 1) {
            next = j;
            break;
          }
        }
        if (next === -1 || next === 0 || visitedSet.has(next)) {
          tour.push("Depot");
          if (next === 0) travelMins += dist[curr][0];
          break;
        }
        visitedSet.add(next);
        travelMins += dist[curr][next];
        tour.push(nodes[next].id);
        curr = next;
      }

      let serviceMins = 0;
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          serviceMins += customers[i].serviceTime;
        }
      }

      return {
        cost: 1, // 单车单次发车
        type: "Binary",
        coefficients,
        meta: {
          tour,
          travelTime: travelMins,
          totalTime: travelMins + serviceMins,
        },
      };
    },
    onIteration: (info) => {
      console.log(
        `Iter ${info.iteration}: LP 松弛目标 = ${info.relaxationObjective?.toFixed(2)}, 新增列数 = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\n状态: ${result.status}`);
  console.log(`最优车辆数: ${result.objectiveValue}`);
  console.log(`生成路线总数: ${result.columnsAdded}`);

  console.log("\n最优车队配置中选中的路线:");
  for (let i = 0; i < customers.length; i++) {
    if ((initialRoutes[i].value ?? 0) > 0.5) {
      const transit = dist[0][i + 1] + dist[i + 1][0];
      const total = transit + customers[i].serviceTime;
      console.log(`  路线: Depot -> ${customers[i].id} -> Depot (行进: ${transit}分, 总耗时: ${total}分) = ${initialRoutes[i].value}`);
    }
  }
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      const meta = col.proposal.meta;
      console.log(`  路线: ${meta?.tour.join(" -> ")} (行进: ${meta?.travelTime}分, 总耗时: ${meta?.totalTime}分) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## 核心要点总结

1. **网络流与 MTZ 子回路消除的真实车辆路径生成**：定价子问题利用有向弧变量 $x_{ij}$、流守恒以及 MTZ 顺序变量 $u_i$，结合网点间实际距离矩阵精准计算巡回路线耗时。
2. **`sum()` 与 `expr` 声明式多资源约束建模**：无需手写冗长的累加循环，直观简洁地表达车辆载重、停靠站点数和路线累计时长限制。
3. **约束对象直接读取对偶影子价格 (`.dual`)**：主问题 LP 松弛解的对偶影子价格直接挂载在 `Constraint` 对象属性上（`c.dual`），无需多余参数或字典查找。
4. **元数据关联与解的完整还原 (`meta`)**：通过 `meta: { tour, travelTime, totalTime }`，直接在结果中保留车辆实际行进序列与统计信息，告别变量名解析的繁琐操作。
