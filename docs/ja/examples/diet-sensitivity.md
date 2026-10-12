# 栄養問題と感度分析 (潜在価格 Dual・スラック Slack)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `m.continuous()`, `m.constrain()`, `expr`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">ソースコード</a></li></ul> |

線形計画問題を解いた際、決定変数の最適値（`var.value`）だけでなく、**感度分析（Sensitivity Analysis）**の情報を取得できると実務での意思決定が格段に深まります。

1. **潜在価格 (`constr.dual` / Shadow Price):** どの制約条件がコストを押し上げているボトルネックなのか？ その基準が 1 単位厳しくなると目的関数値がいくら変化するか。
2. **スラック (`constr.slack` / 余剰量):** どの制約条件が上限・下限に張り付いており（Binding）、どの制約に余裕（Surplus）があるか。
3. **被約費用 (`var.reducedCost`):** 最適解で選ばれなかった選択肢（値 `0`）が、あと何ドル安くなれば最適解に採用されるか。

## WaSHI による実装

<CodeRunner preset="diet_sensitivity">

```typescript
import { Model, expr, dot } from "@ohtaman/washi";

const foods = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

async function runDietSensitivity() {
  const m = new Model("DietSensitivity");

  // 各食品の1日あたり摂取量 (0 〜 最大 4 食分)
  const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4 });

  const costs = Object.fromEntries(foods.map((f) => [f.name, f.cost]));
  const cals  = Object.fromEntries(foods.map((f) => [f.name, f.calories]));
  const prots = Object.fromEntries(foods.map((f) => [f.name, f.protein]));
  const calcs = Object.fromEntries(foods.map((f) => [f.name, f.calcium]));
  const irons = Object.fromEntries(foods.map((f) => [f.name, f.iron]));

  // 目的関数: 1日の食費合計を最小化 (dot による内積)
  m.minimize(dot(costs, srv));

  // 栄養基準の制約: m.constrain と expr による数式定義
  m.constrain(expr`${dot(cals, srv)} >= 2000`, "min_calories")
   .constrain(expr`${dot(prots, srv)} >= 105`,  "min_protein")
   .constrain(expr`${dot(calcs, srv)} >= 1000`, "min_calcium")
   .constrain(expr`${dot(irons, srv)} >= 18`,   "min_iron");

  const status = await m.optimize();

  console.log(`Status: ${status}, Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  console.log("--- Food Servings & Reduced Costs ---");
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`  ${f.name.padEnd(8)}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  console.log("--- Nutritional Constraints (Dual & Slack) ---");
  for (const name of ["min_calories", "min_protein", "min_calcium", "min_iron"]) {
    const c = m.getConstraintByName(name);
    if (c) {
      console.log(`  ${c.name.padEnd(13)}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
    }
  }
}

runDietSensitivity();
```

</CodeRunner>

## 結果の解釈

- **ボトルネック制約 (`slack == 0`, `dual > 0`):** カロリー（2000kcal）と鉄分（18mg）が下限に張り付いており、鉄分の必要量を 1mg 増やすと食費が **$0.3241** 増加することが分かります。
- **余剰のある制約 (`slack > 0`, `dual == 0`):** タンパク質（+46.46g 余剰）とカルシウム（+483.02mg 余剰）はすでに十分満たされているため、潜在価格は `$0` です。
- **被約費用 (`Salmon`):** 不採用（`0.00`）となった Salmon の被約費用は `+1.5125` であり、1食あたり **$1.51** 以上値下がりすれば最適メニューに入ることが分かります。
