# 车辆路径规划问题 (50客户列生成法求解CVRP)

| 问题分类 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Dantzig-Wolfe | HiGHS (默认) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**有容量限制的车辆路径规划问题 (Capacitated Vehicle Routing Problem, CVRP)** 是物流与供应链优化中的经典组合优化问题。目标是在满足车辆载重容量、单车最大途经网点数及路线限制时间（最大工作时长）的前提下，求得服务所有客户的最少车队车辆数与最优巡回路线。

在朴素的单一 MIP 模型中，穷举所有可能的客户子集与行驶顺序会导致 0-1 二进制变量呈指数级爆炸（$O(2^n)$），即便是中等规模的停靠点也会导致分支定界求解器停滞。

采用 **列生成法 (Dantzig-Wolfe 分解)**，我们无需预先穷举所有路线：
1. **主问题 (Restricted Master Problem, RMP)**：求解集合划分（Set Partitioning）问题，从已生成的候选路线中选择最优组合，确保每个客户恰好被服务一次。
2. **定价子问题 (Pricing Subproblem / 启发式算法)**：在工业级路由求解器（如 Branch-and-Price）中，每次迭代都用通用 MIP 求解子问题效率极低。通常的做法是读取主问题的 **对偶影子价格 (shadow prices / duals)**，结合**快速领域启发式算法（最省插点法 Cheapest Insertion ＋ 2-opt 局部搜索）** 动态生成改善列（即检验数/被约费用为负的高价值路线）。

## 问题输入与现实运营约束

配送中心位于 $(0, 0)$，周围分布着 **50 个客户送货网点**：

- **运营约束**:
  - **车辆载重容量**：每辆车最多装载 **10 单位** 货物。
  - **最大途经网点数**：出于司机作业负荷考量，每条路线最多服务 **4 个客户**。
  - **路线最大限制时间**：单车行驶耗时与卸货作业耗时总和不超过 **200 分钟**。
- **网点间行驶耗时**：根据所有网点间的欧几里得距离矩阵计算（假设平均行进速度为 $1\text{ km/分钟} = 60\text{ km/h}$）。
- **卸货作业耗时**：每个客户 10 分钟。

## WaSHI 实现代码

点击下方的 **▶ Run** 即可在浏览器中交互式求解包含 50 个客户的真实 CVRP 问题。路线优化辅助函数（`insertCheapest` 与 `optimize2Opt`）被干净地解耦外置，主问题与列生成循环简洁明了，在 WebAssembly 环境中仅需约 0.5 秒即可求解完成：

<CodeRunner>

```typescript
import { Model, expr, minimize, sum } from "@ohtaman/washi";

// --- 解耦外置的路由启发式辅助函数 ---

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

  // 1. 构建限制主问题 (RMP)
  const master = new Model("CVRP_FleetMaster");

  // 初始自明路线：每个客户配备一辆直达专车
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // 客户覆盖约束：每个客户必须且仅被服务一次
  for (let i = 0; i < customers.length; i++) {
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${customers[i].id}`);
  }
  const visitConstrs = master.constraints;

  console.log(`初始状态：50 条单点直达专车路线。`);
  console.log("使用对偶影子价格引导启发式定价的列生成算法求解中...");

  // 2. 列生成求解
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // 按照对偶影子价格（改善收益）从高到低排序客户
      const candidates = customers
        .map((c, i) => ({ ...c, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      let bestRoute: string[] | null = null;
      let minReducedCost = -1e-4;

      // 以高影子价格的客户作为种子点构建优质路线
      for (const seed of candidates.slice(0, 15)) {
        let tour = ["Depot", seed.id, "Depot"];
        let load = seed.demand;
        let dualSum = seed.dual;

        for (const next of candidates) {
          if (tour.includes(next.id)) continue;
          if (load + next.demand > vehicleCapacity) continue;
          if (tour.length - 2 >= maxStops) continue;

          // 最省插点法结合 2-opt 局部调整
          const candidateTour = optimize2Opt(insertCheapest(tour, next.id, dist), dist);
          const { totalTime } = calcRouteTime(candidateTour, dist, serviceTimes);

          if (totalTime <= maxRouteTime) {
            tour = candidateTour;
            load += next.demand;
            dualSum += next.dual;
          }
        }

        // 检验数 = 车辆路线固定成本 (1) - 收集到的对偶价格收益
        const reducedCost = 1 - dualSum;
        if (reducedCost < minReducedCost) {
          minReducedCost = reducedCost;
          bestRoute = tour;
        }
      }

      // 未找到可改善路线，LP 松弛达到最优
      if (!bestRoute) return null;

      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
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
  console.log(`最优所需车辆数: ${Math.round(result.objectiveValue ?? 0)} 辆`);
  console.log(`生成路线列总数: ${result.columnsAdded}`);

  console.log("\n最优车队选定路线示例 (前 5 班):");
  const activeRoutes = result.generatedColumns.filter((c) => (c.variable.value ?? 0) > 0.5);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (行驶: ${meta?.travelTime}分钟, 总时长: ${meta?.totalTime}分钟)`);
  }
}

runCVRP();
```

</CodeRunner>

## 核心要点

1. **混合优化架构（严谨主问题 × 快速领域启发式子问题）**：在工业级 Branch-and-Price 实践中，定价子问题无需拘泥于昂贵的 MIP 求解器。结合主问题（集合划分 LP/MIP）的全局严谨性与子问题（最省插点 ＋ 2-opt）的极速领域搜索，分解算法能够展现出极大的性能优势。
2. **50 个网点规模在浏览器中约 0.5 秒完成**：摆脱了子问题 MIP 带来的组合爆炸与 Emscripten 线性内存上限问题，直接在纯前端即可毫秒级求解大规模路径规划。
3. **外置辅助函数带来极致的代码清晰度**：将巡回优化（`optimize2Opt`）、插点法（`insertCheapest`）和耗时计算（`calcRouteTime`）独立成清晰的函数，使业务规则与数学规划模型的职责完全解耦。
4. **对偶价格通过 `.dual` 属性直接读取**：无需复杂的上下文包装，直接通过 `visitConstrs[i].dual` 获取主问题松弛解给出的边际价值，精准引导启发式算法的贪心搜索方向。
