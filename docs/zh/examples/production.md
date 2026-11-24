# 生产计划问题 (LP / MIP)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 / 整数规划 (LP / MIP) | HiGHS (默认) | `m.integer()`, `m.constraint()`, `expr` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=production">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">源代码</a></li></ul> |

生产计划是经典的线性与整数规划问题。在原材料、工时等资源约束下，确定各产品的最优产量以最大化总利润。

## 数学模型形式化

设椅子的生产数量为 $x$，桌子的生产数量为 $y$。

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{总利润}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{红木原材料上限}) \\
& 10x + 15y \le 450 & (\text{木工人工工时上限}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z} & (\text{非负整数产量})
\end{aligned}$$

## 使用 WaSHI 实现

<CodeRunner preset="production">

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // 决策变量：非负整数生产数量
  const chairs = m.integer("chairs", { lb: 0 });
  const tables = m.integer("tables", { lb: 0 });

  // 目标函数：最大化总利润（每把椅子 $45，每张桌子 $80）
  m.objective(maximize(expr`45 * ${chairs} + 80 * ${tables}`));

  // 资源约束：通过 expr 与 constraint() 声明式定义公式
  m.constraint(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit");
  m.constraint(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`);
}

runProductionOptimization();
```

</CodeRunner>

## 结果解读与要点

- **最优解分析**：生产 `chairs = 24`、`tables = 14` 时总利润达到最大值 `$2,200`。此时红木消耗 $5 \times 24 + 20 \times 14 = 400$，人工工时消耗 $10 \times 24 + 15 \times 14 = 450$，两项资源恰好完全用尽。
- **为何使用 `m.integer()` 而非 `m.continuous()`**：椅子与桌子必须按整数件生产。虽然本例的连续松弛解恰好也是整数，但使用 `m.integer()` 可以保证在资源上限或单价变化时依然得到整数产量。
