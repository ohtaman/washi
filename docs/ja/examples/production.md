# 生産計画問題 (LP / MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画・整数計画 (LP / MIP) | HiGHS (標準) | `m.addVar()`, `expr`, `c` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=production">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">ソースコード</a></li></ul> |

限られたリソース（木材・労働時間など）の制約を守りながら、どの製品をいくつ生産すれば総利益が最大になるかを求める古典的な最適化問題です。

## 数理モデルの定式化

椅子（chairs）の生産数を $x$、机（tables）の生産数を $y$ とします。

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{総利益}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{マホガニー材の上限}) \\
& 10x + 15y \le 450 & (\text{木工労働時間の上限}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z}
\end{aligned}$$

## WaSHI による実装

<CodeRunner preset="production">

```typescript
import { Model, expr, c } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // 決定変数: 椅子と机の生産数 (非負整数)
  const chairs = m.addVar({ name: "chairs", lb: 0, type: "Integer" });
  const tables = m.addVar({ name: "tables", lb: 0, type: "Integer" });

  // 目的関数: 総利益の最大化 ($45/椅子, $80/机)
  m.maximize(expr`45 * ${chairs} + 80 * ${tables}`);

  // リソース制約
  m.addConstraint(c`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit");
  m.addConstraint(c`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`);
}

runProductionOptimization();
```

</CodeRunner>
