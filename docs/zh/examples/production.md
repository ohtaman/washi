# 生产计划问题 (LP / MIP)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 / 整数规划 (LP / MIP) | HiGHS (默认) | `m.integer()`, `m.constraint()`, `expr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=production">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">源代码</a></li></ul> |

生产计划是一个经典的线性与整数规划问题：在满足各项资源约束（原材料、机器工时、人工工时等）的前提下，确定每种产品的最优生产数量，使总利润最大化。

## 数学模型形式化

设椅子（chairs）的生产数量为 $x$，桌子（tables）的生产数量为 $y$。

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

  // 资源约束：通过 expr 与链式 constraint() 声明式定义公式
  m.constraint(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit")
   .constraint(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`);
}

runProductionOptimization();
```

</CodeRunner>
