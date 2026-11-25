# 生産計画問題 (整数計画 / MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 整数計画 (MIP) | HiGHS (標準) | `m.integer()`, `m.constraint()`, `expr`, `maximize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=production">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">ソースコード</a></li></ul> |

限られたリソース（木材・労働時間など）の制約のもとで、総利益が最大となる各製品の生産数を求める古典的な最適化問題です。

## 数理モデルの定式化

椅子の生産数を $x$（利益 `$45`/脚）、机の生産数を $y$（利益 `$80`/台）とします。

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{総利益}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{マホガニー材の上限}) \\
& 10x + 15y \le 450 & (\text{木工労働時間の上限}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z}
\end{aligned}$$

## WaSHI による実装

<CodeRunner preset="production">

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // 決定変数: 椅子と机の生産数 (非負整数)
  const chairs = m.integer("chairs", { lb: 0 });
  const tables = m.integer("tables", { lb: 0 });

  // 目的関数: 総利益の最大化 (椅子 $45/脚, 机 $80/台)
  m.objective(maximize(expr`45 * ${chairs} + 80 * ${tables}`));

  // リソース制約: マホガニー材と木工労働時間の上限
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

## 解の読み解きとポイント

- **最適解の確認**: `chairs = 24`、`tables = 14` のとき総利益は最大の `$2,200` になります。マホガニー材は $5 \times 24 + 20 \times 14 = 400$、木工労働時間は $10 \times 24 + 15 \times 14 = 450$ となり、2 つのリソースをちょうど上限まで使い切っています。
- **`m.continuous()` ではなく `m.integer()` を使う理由**: 椅子や机は個数単位で生産するため端数（小数）を取ることができません。この数値例では連続変数として解いた場合（LP 緩和解）もたまたま整数になりますが、`m.integer()` にしておけば上限値や利益単価が変わっても整数最適解が得られます。
