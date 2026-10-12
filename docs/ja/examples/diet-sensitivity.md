# 栄養問題と感度分析 (潜在価格 Dual・スラック Slack)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `constr.dual`, `constr.slack`, `var.reducedCost` | [Playground で開く](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) · [ソースコード](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |

線形計画問題を解いた際、決定変数の最適値（`var.value`）だけでなく、**感度分析（Sensitivity Analysis）**の情報を取得できると実務での意思決定が格段に深まります。

1. **潜在価格 (`constr.dual` / Shadow Price):** どの制約条件がコストを押し上げているボトルネックなのか？ その基準が 1 単位厳しくなると目的関数値がいくら変化するか。
2. **スラック (`constr.slack` / 余剰量):** どの制約条件が上限・下限に張り付いており（Binding）、どの制約に余裕（Surplus）があるか。
3. **被約費用 (`var.reducedCost`):** 最適解で選ばれなかった選択肢（値 `0`）が、あと何ドル安くなれば最適解に採用されるか。

---

## WaSHI による実装

```typescript
import { Model, sum } from "@ohtaman/washi";

const foods = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

async function runDietSensitivity() {
  const m = new Model({ name: "DietSensitivity", sense: "Minimize" });

  // 各食品の1日あたり摂取量 (0 〜 最大 4 食分)
  const srv = m.addVars(foods.map((f) => f.name), { lb: 0, ub: 4, prefix: "srv" });

  // 目的関数: 1日の食費合計を最小化
  m.minimize(sum(foods, (f) => srv[f.name].mul(f.cost)));

  // 栄養基準の制約オブジェクトを保持し、solve() 後に .dual と .slack を参照
  const cCal  = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.calories)).ge(2000), "min_calories");
  const cProt = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.protein)).ge(105),   "min_protein");
  const cCalc = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.calcium)).ge(1000),  "min_calcium");
  const cIron = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.iron)).ge(18),       "min_iron");

  await m.solve();

  console.log(`Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`${f.name}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  for (const c of [cCal, cProt, cCalc, cIron]) {
    console.log(`${c.name}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
  }
}

runDietSensitivity();
```

---

## 実行結果と解釈

```text
Status: Optimal
Minimum Daily Cost: $13.66

1. Food Basket & Reduced Costs (var.value, var.reducedCost):
Food      | Servings | Unit Cost | Reduced Cost | Interpretation
----------+----------+-----------+--------------+-------------------------------------------
Oats      |     4.00 |     $0.60 |     -1.3546 | At upper serving cap (4.0)
Chicken   |     1.55 |     $2.40 |     +0.0000 | In optimal menu
Eggs      |     4.00 |     $0.80 |     -1.0307 | At upper serving cap (4.0)
Milk      |     4.00 |     $0.90 |     -0.2294 | At upper serving cap (4.0)
Spinach   |     0.50 |     $1.50 |     +0.0000 | In optimal menu
Salmon    |     0.00 |     $3.60 |     +1.5125 | Needs -$1.51 price drop to enter menu

2. Nutritional Constraints & Shadow Prices (constr.dual, constr.slack):
Requirement      | Target |  Slack (Surplus) | Shadow Price (Dual) | Status
-----------------+--------+------------------+---------------------+--------------------
Calories (kcal)  | >= 2000|             0.00 |           $0.0091 | BINDING (Bottleneck)
Protein (g)      | >=  105|            46.46 |           $0.0000 | Non-binding (Surplus)
Calcium (mg)     | >= 1000|           483.02 |           $0.0000 | Non-binding (Surplus)
Iron (mg)        | >=   18|             0.00 |           $0.3241 | BINDING (Bottleneck)
```

- **ボトルネック制約 (`slack == 0`, `dual > 0`):** カロリー（2000kcal）と鉄分（18mg）が下限に張り付いており、鉄分の必要量を 1mg 増やすと食費が **$0.3241** 増加することが分かります。
- **余剰のある制約 (`slack > 0`, `dual == 0`):** タンパク質（+46.46g 余剰）とカルシウム（+483.02mg 余剰）はすでに十分満たされているため、潜在価格は `$0` です。
- **被約費用 (`Salmon`):** 不採用（`0.00`）となった Salmon の被約費用は `+1.5125` であり、1食あたり **$1.51** 以上値下がりすれば最適メニューに入ることが分かります。
