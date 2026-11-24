# 旅行商问题 (TSP: Benders分解)

| 问题分类 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 组合优化 / Benders分解 | HiGHS (默认) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">源代码</a></li><li><a href="/zh/guide/decomposition">分解算法指南</a></li></ul> |

**旅行商问题（TSP）** 寻找一条恰好访问每座城市一次并返回起点的最短闭合回路。

在 **Dantzig-Fulkerson-Johnson (DFJ)** 形式化中，为消除称为**子回路**的孤立小环，需对城市的每个非空真子集 $S \subset V$ 添加子回路消除约束：

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

由于子集共有 $2^n - 2$ 个，城市数增加后无法预先列出全部约束。采用 **Benders 分解（延迟割平面分离）** 可按需补充被违反的约束：
1. **主问题（Master Problem）**：求解度数分配松弛，要求每个城市入度与出度均为 1。
2. **分离子问题（Subproblem）**：检查主问题解中的有向环路。若存在多个孤立子回路，则一次性返回所有对应的 **Benders 可行割**（多割分离），直到得到单一连通回路。

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
import { Model, expr, minimize } from "@ohtaman/washi";

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
  const distMatrix = {};

  for (let i = 0; i < n; i++) {
    x[i] = {};
    distMatrix[i] = {};
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        x[i][j] = master.binary(`x_${i}_${j}`);
        distMatrix[i][j] = dist(i, j);
      }
    }
  }

  // 目标函数：最小化总巡回距离
  master.objective(minimize(expr`dot(${distMatrix}, ${x})`));

  // 每个城市有 1 条出边和 1 条入边
  for (let i = 0; i < n; i++) {
    master.constraint(expr`sum(${x[i]}) == 1`, `out_${i}`);
    master.constraint(expr`sum(${n}, ${(j) => x[j][i]}) == 1`, `in_${i}`);
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
          if (i !== j && x[i][j].value === 1) {
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

      // 若环路超过 1 个，对所有孤立子回路同时注入 Benders 可行割（多割分离）
      if (cycles.length > 1) {
        return cycles.map((cycle) => {
          const S = new Set(cycle);
          cutCounter++;
          console.log(`检测到子回路: [${cycle.map(k => cities[k].name).join(" -> ")}]。注入 Benders 割平面 #${cutCounter}。`);

          // 割约束：sum_{i in S, j not in S} x_ij >= 1
          const outCities = Array.from({ length: n }, (_, j) => j).filter((j) => !S.has(j));
          const cutEdges = cycle.flatMap((i) => outCities.map((j) => x[i][j]));

          return {
            kind: "feasibility",
            constraint: expr`sum(${cutEdges}) >= 1`,
            name: `subtour_cut_${cutCounter}`,
          };
        });
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
      if (i !== j && result.values[`x_${i}_${j}`] === 1) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (距离: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
}

runTSP();
```

</CodeRunner>

## 结果解读与要点

### 延迟子回路消除与多割分离

主问题初始只包含 $2n$ 条度数约束，仅在当前解出现孤立子回路时通过 `subproblem` 注入割平面。返回割平面数组（`cycles.map(...)`）可在一轮内消除所有孤立子回路，减少主问题 MIP 的重求解次数。形成单一连通回路后返回 `null` 即可结束迭代。

### 两种等价的 DFJ 割平面形式

每个城市满足出度等式 $\sum_{j \ne i} x_{ij} = 1$。对 $i \in S$ 求和可得：

$$\sum_{i \in S, \, j \in S} x_{ij} + \sum_{i \in S, \, j \notin S} x_{ij} = |S|$$

因此，上方代码使用的割集不等式 $\sum_{i \in S, j \notin S} x_{ij} \ge 1$ 与 [`14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts) 中的内部边不等式 $\sum_{i \in S, j \in S} x_{ij} \le |S| - 1$ 在代数上完全等价。

### 预先消除双城往返子回路

在城市数较多的实例中，初始迭代最容易出现两城往返小环（$i \leftrightarrow j$）。在主问题中预先加入 $\binom{n}{2}$ 条 $x_{ij} + x_{ji} \le 1$ 约束，通常能显著减少 Benders 迭代轮数。
