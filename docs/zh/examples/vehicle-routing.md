# 车辆路径规划问题 (列生成法求解 CVRP)

| 问题分类 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` (`sum`) | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="/zh/guide/decomposition">分解算法指南</a></li></ul> |

本示例中的 **有容量限制的车辆路径规划问题（CVRP）** 变体旨在用最少的车辆服务所有客户。除载重容量外，每条路线还需满足单车最大途经点数以及路线时长限制。

若在单一 MIP 模型中预先枚举所有可行路线，变量数量会随客户数 $n$ 发生组合爆炸（仅无序客户子集一般就有 $O(2^n)$ 种，区分访问顺序时规模更大）。采用 **列生成法（Dantzig-Wolfe 分解）** 可以按需生成候选路线：
1. **受限主问题（RMP）**：在列生成迭代期间求解已生成候选路线上的集合划分问题 **LP 松弛**（最终再求解 MIP），使每个客户恰好被访问一次。
2. **定价子问题**：读取受限主问题 LP 松弛的对偶值（影子价格），通过最省插点法（Cheapest Insertion）与 2-opt 局部搜索构造检验数 $\bar{c}_r = 1 - \sum_{i \in r} \pi_i < 0$ 的路线 $r$。

## 输入数据与约束条件

配送中心位于 $(0, 0)$，包含 **50 个客户网点**（各客户需求为 **1 至 4 单位**）：

- **车辆载重容量**：每辆车最多 **10 单位**。
- **最大途经网点数**：每条路线最多访问 **4 个客户**。
- **最大路线时长**：单车行驶时间与卸货时间之和不超过 **200 分钟**。
- **行驶与作业耗时**：节点间欧氏距离四舍五入取整后的值（`Math.round`，1 单位 = 1 分钟），另加每个客户 **10 分钟** 卸货耗时。

## WaSHI 实现

<CodeRunner>

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

interface RouteMeta {
  tour: string[];
  travelTime: number;
  totalTime: number;
}

interface CandidateCustomer {
  id: string;
  demand: number;
  dual: number;
}

interface RouteConstraints {
  dist: (a: string, b: string) => number;
  serviceTimes: Record<string, number>;
  vehicleCapacity: number;
  maxStops: number;
  maxRouteTime: number;
}

// --- 定价子问题路由启发式辅助函数 ---

// 2-opt 局部搜索算法（消除交叉路径，缩短行驶距离）
function optimize2Opt(tour: string[], dist: (a: string, b: string) => number): string[] {
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

// 最省插点法（选择总距离增量最小的位置插入客户）
function insertCheapest(tour: string[], id: string, dist: (a: string, b: string) => number): string[] {
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
function calcRouteTime(
  tour: string[],
  dist: (a: string, b: string) => number,
  serviceTimes: Record<string, number>
) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

// 定价子问题：根据对偶值（影子价格）搜索检验数为负（1 - dualSum < 0）的改善路线
function findImprovingRoute(candidates: CandidateCustomer[], config: RouteConstraints): string[] | null {
  let bestRoute: string[] | null = null;
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
  const dist = (a: string, b: string) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig: RouteConstraints = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. 构建受限主问题 (RMP)
  const master = new Model("CVRP_FleetMaster");

  // 初始自明路线：每个客户配备一辆直达专车
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(expr`sum(${initialRoutes})`));

  // 客户访问约束（集合划分）：每个客户必须且仅被服务一次
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`初始状态：50 条单点直达专车路线。`);
  console.log("使用对偶值（影子价格）引导启发式定价的列生成算法求解中...");

  // 2. 列生成求解
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. 按照对偶值（影子价格）从高到低排序客户
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. 定价子问题启发式搜索：寻找检验数为负的路线
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // 未找到可改善路线

      // 3. 将新改善路线作为新列引入受限主问题
      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary" as const,
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\n求解状态: ${result.status}`);
  console.log(`车队所需车辆数: ${Math.round(result.objectiveValue ?? 0)} 辆 (启发式列生成解)`);
  console.log(`生成路线列总数: ${result.columnsAdded}`);

  console.log("\n选定车队的路线示例 (前 5 班):");
  const activeRoutes: RouteMeta[] = [];
  for (let i = 0; i < customers.length; i++) {
    if (initialRoutes[i].value === 1) {
      const tour = ["Depot", customers[i].id, "Depot"];
      const { travelTime, totalTime } = calcRouteTime(tour, dist, serviceTimes);
      activeRoutes.push({ tour, travelTime, totalTime });
    }
  }
  for (const c of result.generatedColumns) {
    if (c.variable.value === 1 && c.proposal.meta) {
      activeRoutes.push(c.proposal.meta);
    }
  }
  for (const r of activeRoutes.slice(0, 5)) {
    console.log(`  ${r.tour.join(" -> ")} (行驶: ${r.travelTime}分钟, 总时长: ${r.totalTime}分钟)`);
  }
}

runCVRP();
```

</CodeRunner>

## 结果解读与要点

### 受限主问题、定价子问题与路线元数据

受限主问题负责求解 LP 松弛与最终集合划分 MIP。在 `pricing` 回调中，`visitConstrs[i].dual` 提供各客户的对偶值（影子价格），用于优先挑选边际收益更高的客户。每列在 `meta` 中保存 `{ tour, travelTime, totalTime }`，求解完成后可直接从 `result.generatedColumns` 查看访问顺序与耗时。

### 集合划分（`== 1`）与集合覆盖（`>= 1`）

本例采用 `== 1` 约束以禁止最终 MIP 重复访问同一客户。在大规模列生成实践中，改用 `>= 1` 可将对偶值限制在 $\pi_i \ge 0$，有助于稳定 LP 收敛。当距离满足三角不等式时，后处理剔除重复访问不会增加任何路线的行驶时间（也不会增加载重、途经点数或车辆数）；但像本例这样用 `Math.round` 对距离取整时，需注意舍入误差可能导致三角不等式出现微小偏差。

### 启发式定价与精确 ESPPRC

`findImprovingRoute` 采用最省插点法与 2-opt 启发式，而非精确的带资源约束初等最短路（ESPPRC）求解器。因此返回 `null` 仅说明启发式未找到更多负检验数路线，并不构成全局 LP 最优性证明。

### Price-and-Branch（`finalizeAsMIP: true`）

在根节点列生成结束后，对现有列池求解一次 MIP 的做法称为 **受限主问题启发式**（Price-and-Branch）。无需实现完整的 Branch-and-Price 分支定界树，即可快速获得高质量的整数车队方案。
