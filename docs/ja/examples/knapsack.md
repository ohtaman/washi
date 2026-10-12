# 0-1 ナップサック問題 (Binary MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 0-1 整数計画 (Binary MIP) | HiGHS (標準) | `m.addVars(keys)`, `type: "Binary"`, `sum()` | [Playground で開く](https://ohtaman.github.io/washi/demo/?preset=knapsack) · [ソースコード](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |

各アイテムの「重さ」と「価値」が与えられたとき、バックパックの重量上限を超えない範囲で価値の合計が最大になるアイテムの組み合わせを選ぶ離散最適化問題です。

---

## WaSHI による実装

```typescript
import { Model, sum } from "@ohtaman/washi";

async function runKnapsack() {
  const m = new Model("Knapsack");

  const items = [
    { name: "Laptop",   weight: 3, value: 50 },
    { name: "Camera",   weight: 2, value: 40 },
    { name: "Drone",    weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent",     weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // 0-1 決定変数: x[name] = 1 (選ぶ) または 0 (選ばない)
  const x = m.addVars(items.map((it) => it.name), { type: "Binary" });

  // 目的関数: 選んだアイテムの価値合計を最大化
  m.maximize(sum(items, (it) => x[it.name].mul(it.value)));

  // 重量上限の制約
  m.addConstraint(
    sum(items, (it) => x[it.name].mul(it.weight)).le(maxCapacity),
    "capacity_limit"
  );

  await m.solve();
  console.log(`Max Total Value: $${m.objectiveValue}`);
}

runKnapsack();
```
