# 车辆路径规划问题 (列生成法求解 CVRP)

| 问题分类 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**有容量限制的车辆路径规划问题 (Capacitated Vehicle Routing Problem, CVRP)** 在满足车辆载重容量、单车最大途经网点数及路线时长限制的前提下，求服务所有客户所需的车辆数与配送路线。

若在单一 MIP 模型中预先枚举所有客户组合与访问顺序，0-1 变量规模将以 $O(2^n)$ 增长。采用 **列生成法 (Dantzig-Wolfe 分解)** 可按需生成候选路线：
1. **受限主问题 (Restricted Master Problem, RMP)**：求解集合划分（Set Partitioning）问题，从已生成的候选路线中选择使每个客户恰好被访问一次的组合。
2. **定价子问题 (Pricing Subproblem)**：读取主问题 LP 松弛的对偶值（影子价格 `dual`），通过最省插点法（Cheapest Insertion）与 2-opt 局部搜索构造检验数为负（$\bar{c} = 1 - \sum \pi_i < 0$）的候选路线。

## 输入数据与约束条件

配送中心位于 $(0, 0)$，包含 **50 个客户网点**：

- **车辆载重容量**：每辆车最多 **10 单位**。
- **最大途经网点数**：每条路线最多访问 **4 个客户**。
- **最大路线时长**：单车行驶时间与卸货时间之和不超过 **200 分钟**。
- **行驶与作业耗时**：节点间欧氏距离（1 单位 = 1 分钟），每个客户卸货耗时 **10 分钟**。

## WaSHI 实现

<CodeRunner>

```typescript
import { Model, expr, minimize, sum } from "@ohtaman/washi";

// --- 解耦外置的路由启发式辅助函数（子问题） ---

// 2-opt 局部搜索算法（消除交叉路径，缩短行驶距离）
function optimize2Opt(tour, dist) {
  let best = [...tour];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const dCurrent = dist(best[i - 1], best[i]) + dist(best[j], best[j + 1]);
        const dSwap = dist(best[i - 1], best[j]) + dist(best[i], best[j + 1]);
        if (dSwap < dCurrent) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

// 最省插点法（选择绕行增量最小的段位插入客户）
function insertCheapest(tour, id, dist) {
  let bestPos = 1;
  let minCost = Infinity;

  for (let p = 1; p < tour.length; p++) {
    const cost = dist(tour[p - 1], id) + dist(id, tour[p]) - dist(tour[p - 1], tour[p]);
    if (cost < minCost) {
      minCost = cost;
      bestPos = p;
    }
  }
  return [...tour.slice(0, bestPos), id, ...tour.slice(bestPos)];
}

// 计算路线行驶耗时与总作业时长（行驶耗时 + 卸货耗时）
function calcRouteTime(tour, dist, serviceTimes) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

// 定价子问题：根据对偶影子价格搜索检验数为负（1 - dualSum < 0）的最佳改善路线
function findImprovingRoute(candidates, config) {
  let bestRoute = null;
  let minReducedCost = -1e-4;

  for (const seed of candidates.slice(0, 15)) {
    let tour = ["Depot", seed.id, "Depot"];
    let load = seed.demand;
    let dualSum = seed.dual;

    for (const next of candidates) {
      if (tour.includes(next.id)) continue;
      if (load + next.demand > config.vehicleCapacity) continue;
      if (tour.length - 2 >= config.maxStops) continue;

      const candidateTour = optimize2Opt(insertCheapest(tour, next.id, config.dist), config.dist);
      const { totalTime } = calcRouteTime(candidateTour, config.dist, config.serviceTimes);

      if (totalTime <= config.maxRouteTime) {
        tour = candidateTour;
        load += next.demand;
        dualSum += next.dual;
      }
    }

    const reducedCost = 1 - dualSum;
    if (reducedCost < minReducedCost) {
      minReducedCost = reducedCost;
      bestRoute = tour;
    }
  }
  return bestRoute;
}

// --- 主程序：50 客户列生成法求解 CVRP ---

async function runCVRP() {
  const vehicleCapacity = 10;
  const maxStops = 4;
  const maxRouteTime = 200; // 分钟

  // 配送中心与 50 个客户数据
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = Array.from({ length: 50 }, (_, i) => {
    const angle = i * 2.4;
    const radius = 15 + (i % 5) * 8;
    return {
      id: `C${i + 1}`,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      demand: 1 + (i % 4),
      serviceTime: 10,
    };
  });

  const nodes = Object.fromEntries([depot, ...customers].map((n) => [n.id, n]));
  const dist = (a, b) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. 构建限制主问题 (RMP)
  const master = new Model("CVRP_FleetMaster");

  // 初始自明路线：每个客户配备一辆直达专车
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // 客户覆盖约束：每个客户必须且仅被服务一次
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`初始状态：50 条单点直达专车路线。`);
  console.log("使用对偶影子价格引导启发式定价的列生成算法求解中...");

  // 2. 列生成求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. 按照对偶影子价格（改善收益）从高到低排序客户
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. 子问题启发式搜索：寻找检验数为负的路线
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // 未找到可改善路线，LP 松弛达到最优

      // 3. 将新改善路线作为新列引入主问题
      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary",
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\n求解状态: ${result.status}`);
  console.log(`车队所需车辆数: ${Math.round(result.objectiveValue ?? 0)} 辆 (启发式列生成解)`);
  console.log(`生成路线列总数: ${result.columnsAdded}`);

  console.log("\n选定车队的路线示例 (前 5 班):");
  const activeRoutes = result.generatedColumns.filter((c) => c.variable.value === 1);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (行驶: ${meta?.travelTime}分钟, 总时长: ${meta?.totalTime}分钟)`);
  }
}

runCVRP();
```

</CodeRunner>

## 说明

- **主问题与定价子问题分离**：主问题负责求解 LP 松弛与最终的集合划分 MIP，`pricing` 回调使用最省插点法与 2-opt 局部搜索生成负检验数路线。
- **读取对偶变量**：通过 `visitConstrs[i].dual` 直接读取主问题 LP 松弛的对偶价格，在构造路线时优先考虑边际收益较高的客户。
- **路线元数据记录**：生成的每一列在 `meta` 中保存 `{ tour, travelTime, totalTime }`，求解完成后可从 `result.generatedColumns` 中读取访问顺序与耗时。
- **集合划分 (`== 1`) 与集合覆盖 (`>= 1`)**：本例使用 `== 1`（集合划分）直接禁止同一客户被多辆车重复访问。在大规模列生成实践中，改用 `>= 1`（集合覆盖）可将对偶价格限制在 $\pi_i \ge 0$，从而提升 LP 收敛稳定性（当距离满足三角不等式时，最终解中重复访问的客户可通过后处理直接剔除而不增加路程）。
- **启发式定价与精确 ESPPRC**：由于 `findImprovingRoute` 使用快速贪心插点与 2-opt 启发式而非精确的带资源约束初等最短路（ESPPRC）算法，返回 `null` 仅代表启发式搜索未发现更多负检验数路线，而非全局对偶下界证明。
- **Price-and-Branch (`finalizeAsMIP: true`)**：在根节点列生成收敛后对现有列池求解一次 MIP 的方法称为限制主问题启发式（Restricted Master Heuristic / Price-and-Branch），无需实现完整的 Branch-and-Price 分支定界树即可快速获得高质量整数车队方案。
