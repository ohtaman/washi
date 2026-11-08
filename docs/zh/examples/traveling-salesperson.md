# 旅行商问题 (TSP: Benders分解)

| 问题分类 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Benders分解 | HiGHS (默认) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">源代码</a></li><li><a href="../guide/decomposition.md">分解算法指南</a></li></ul> |

**旅行商问题（TSP: Traveling Salesperson Problem）** 要求寻找一条恰好访问每座城市一次并回到起点的最短闭合回路（Tour）。

在 **Dantzig-Fulkerson-Johnson (DFJ)** 形式化中，为了消除孤立小环（**子回路: Subtour**），需要对城市的每个非空真子集 $S \subset V$ 加入子回路消除约束：

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

由于子集共有 $2^n - 2$ 个，当城市数量增加时，预先加入全部子回路约束并不现实。采用 **Benders分解（延迟割平面分离: Lazy Subtour Elimination）** 可按需添加被违反的约束：
1. **主问题（Master Problem）**：求解度数分配松弛（每个城市入度为 1、出度为 1）。
2. **分离平子问题（Subproblem）**：检查主问题解构成的有向图；若存在多个连通环路，则生成一条消除最小子回路的 **Benders 可行割（Feasibility Cut）** 并加入主问题，迭代直至形成单一回路。

## 输入数据

考虑二维欧氏坐标系上的 **5 座城市**：

| 城市 | 坐标 $(x, y)$ |
| :--- | :---: |
| **城市 A (0)** | $(0, 0)$ |
| **城市 B (1)** | $(1, 0)$ |
| **城市 C (2)** | $(1, 2)$ |
| **城市 D (3)** | $(0, 2)$ |
| **城市 E (4)** | $(0.5, 3)$ |

## WaSHI 实现

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

      return null; // 已形成单一连通回路
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

## 说明

- **延迟子回路消除**：主问题初始仅包含 $2n$ 条度数约束，仅在当前解出现孤立子回路时才向主问题添加相应割平面。
- **分离回调**：`subproblem` 回调通过 `x[i][j].value` 读取主问题选定的边，遍历连通分量并在存在多个环路时返回 `{ kind: "feasibility", constraint: ... }`。
- **终止条件**：当 `subproblem` 返回 `null` 时，表示不再存在被违反的子回路约束，迭代结束。
