# 0-1 背包问题 (Binary MIP)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 0-1 整数规划 (Binary MIP) | HiGHS (默认) | `m.binary()`, `m.constraint()`, `expr`, `maximize`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=knapsack">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts">源代码</a></li></ul> |

0-1 背包问题是经典的组合优化问题：给定一组物品，每件物品都有对应的重量和价值，要求在所选物品总重量不超过容量上限的前提下，决定选择哪些物品放入背包，从而使总价值最大化。

## 数学模型形式化

设 $x_i \in \{0, 1\}$ 为 0-1 二元决策变量，表示是否选择物品 $i$（选中为 $x_i = 1$，不选为 $x_i = 0$）：

$$\begin{aligned}
\text{Maximize} \quad & \sum_{i} v_i x_i & (\text{总价值}) \\
\text{Subject to} \quad & \sum_{i} w_i x_i \le W & (\text{重量容量上限}) \\
& x_i \in \{0, 1\} & (\text{0-1 二元决策})
\end{aligned}$$

## 使用 WaSHI 实现

<CodeRunner preset="knapsack">

```typescript
import { Model, maximize, dot, expr } from "@ohtaman/washi";

async function solveKnapsack() {
  const m = new Model("Knapsack");

  const items = [
    { name: "Laptop",   weight: 3, value: 50 },
    { name: "Camera",   weight: 2, value: 40 },
    { name: "Drone",    weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent",     weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // 创建 0-1 二元变量字典：x[name]（取值为 0 或 1）
  const x = m.binary(items.map((it) => it.name));

  const values = Object.fromEntries(items.map((it) => [it.name, it.value]));
  const weights = Object.fromEntries(items.map((it) => [it.name, it.weight]));

  // 目标函数：通过点积（dot）最大化所选物品的总价值
  m.objective(maximize(dot(values, x)));

  // 重量上限约束：使用自然的 expr 与 constraint() 语法
  m.constraint(expr`${dot(weights, x)} <= ${maxCapacity}`, "capacity_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  console.log("Selected Items:", m.getValues(x));
}

solveKnapsack();
```

</CodeRunner>
