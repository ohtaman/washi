# 旅行商问题 (TSP: Benders分解)

| 问题类型 | 求解器 | 核心 API | 相关链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Benders分解 | HiGHS (默认) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**旅行商问题（TSP: Traveling Salesperson Problem）** 是运筹学领域最经典的 NP-hard 组合优化难题：寻找一条恰好经过每座城市一次并最终回到起点的闭合巡回路径（Tour），使得总行程最短。

在经典的 **Dantzig-Fulkerson-Johnson (DFJ) 形式化** 中，为了消除孤立小闭环（**子回路: Subtour**），需要对城市的每个非空真子集 $S \subset V$ 加入子回路消除约束：

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

由于子集总数多达 $2^n - 2$ 个，即便只有 20 座城市，约束量也将突破百万条，无法一次性预先加载到模型中。

采用 **Benders分解（延迟割平面分离: Lazy Subtour Elimination）** 可高效突破该瓶颈：
1. **主问题（Master Problem）**：仅求解轻量的度数分配松弛（每个城市入度为 1、出度为 1）。
2. **Benders 分离子问题（Subproblem）**：检查主问题暂定解所构成的有向图；若发现孤立小回路，则动态生成打破该回路的 **Benders 可行割（Feasibility Cut）** 注入主问题，循环往复直至收敛至单一完整回路。

## 问题输入数据

考虑位于二维欧氏坐标系上的 **5 座城市**：

| 城市 | 坐标 $(x, y)$ | 职能角色 |
| :--- | :---: | :--- |
| **城市 A (0)** | $(0, 0)$ | 起点 / 枢纽 |
| **城市 B (1)** | $(1, 0)$ | 南部站点 |
| **城市 C (2)** | $(1, 2)$ | 东部站点 |
| **城市 D (3)** | $(0, 2)$ | 北部站点 |
| **城市 E (4)** | $(0.5, 3)$ | 极北顶点 |

## WaSHI 建模实现

点击下方的 **▶ 运行（Run）** 按钮，可在浏览器内直接启动求解器，观察算法在第一轮检测到子回路 `[A -> B -> A]`、注入 Benders 割平面并在第 2 轮即收敛至全局最优回路的过程：

<CodeRunner>

```typescript
import { Model, expr, minimize, LinExpr } from "@ohtaman/washi";

async function runTSP() {
  const cities = [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 1, y: 0 },
    { name: "C", x: 1, y: 2 },
    { name: "D", x: 0, y: 2 },
    { name: "E", x: 0.5, y: 3 },
  ];
  const n = cities.length;

  function dist(i, j) {
    const dx = cities[i].x - cities[j].x;
    const dy = cities[i].y - cities[j].y;
    return Math.hypot(dx, dy);
  }

  // 1. 主问题：度数分配松弛（每个城市 1 条出边、1 条入边）
  const master = new Model("TSP_BendersMaster");
  const x = {};

  for (let i = 0; i < n; i++) {
    x[i] = {};
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        x[i][j] = master.binary(`x_${i}_${j}`);
      }
    }
  }

  // 目标函数：最小化总巡回距离
  let totalDistance = new LinExpr();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        totalDistance = totalDistance.add(x[i][j].mul(dist(i, j)));
      }
    }
  }
  master.objective(minimize(totalDistance));

  // 每个城市有 1 条出边和 1 条入边
  for (let i = 0; i < n; i++) {
    let outExpr = new LinExpr();
    let inExpr = new LinExpr();
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        outExpr = outExpr.add(x[i][j]);
        inExpr = inExpr.add(x[j][i]);
      }
    }
    master.constraint(expr`${outExpr} == 1`, `out_${i}`);
    master.constraint(expr`${inExpr} == 1`, `in_${i}`);
  }

  console.log("启动 Benders 延迟子回路消除算法求解 TSP...");

  // 2. 调用 Benders 分解求解
  let cutCounter = 0;
  const result = await master.solveBenders({
    subproblem: () => {
      // 提取主问题暂定解所激活的有向边
      const succ = {};
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && Math.round(x[i][j].value ?? 0) === 1) {
            succ[i] = j;
          }
        }
      }

      // 追踪连通环路
      const visited = new Set();
      const cycles = [];
      for (let i = 0; i < n; i++) {
        if (!visited.has(i)) {
          const cycle = [];
          let curr = i;
          while (!visited.has(curr)) {
            visited.add(curr);
            cycle.push(curr);
            curr = succ[curr];
          }
          cycles.push(cycle);
        }
      }

      // 若环路超过 1 个，说明存在子回路：注入 Benders 可行割
      if (cycles.length > 1) {
        const smallestCycle = cycles.reduce((min, c) => (c.length < min.length ? c : min));
        const S = new Set(smallestCycle);
        cutCounter++;
        console.log(`检测到子回路: [${smallestCycle.map(k => cities[k].name).join(" -> ")}]。注入 Benders 割平面 #${cutCounter}。`);

        // 割约束：sum_{i in S, j not in S} x_ij >= 1
        let cutLhs = new LinExpr();
        for (const i of S) {
          for (let j = 0; j < n; j++) {
            if (!S.has(j)) {
              cutLhs = cutLhs.add(x[i][j]);
            }
          }
        }

        return {
          kind: "feasibility",
          constraint: expr`${cutLhs} >= 1`,
          name: `subtour_cut_${cutCounter}`,
        };
      }

      return null; // 找到连通所有城市的全局单一回路！
    },
  });

  console.log(`\n求解状态: ${result.status}`);
  console.log(`最短巡回距离: ${result.objectiveValue?.toFixed(3)}`);
  console.log(`注入 Benders 割平面总数: ${result.cutsAdded}`);
  console.log(`迭代轮数: ${result.iterations}`);

  console.log("\n最优巡回选定边:");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (result.values[`x_${i}_${j}`] ?? 0) > 0.5) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (距离: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
}

runTSP();
```

</CodeRunner>

## 核心要点

1. **避免预置指数级约束**：初始阶段仅需度数分配松弛，仅在被违反时才按需生成割平面。
2. **高效自定义分离器**：`subproblem` 直接读取主问题暂定解 `x[i][j].value`，利用 $O(V)$ 的图遍历查找最小环，以 `{ kind: "feasibility", constraint: ... }` 简洁注入割平面。
3. **收敛证明**：当子问题返回 `null` 时，数学上保证不存在任何被违反的子回路，求得全局最优解。
