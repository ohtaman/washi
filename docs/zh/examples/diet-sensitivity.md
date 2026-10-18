# 营养问题与灵敏度分析 (LP 对偶值与松弛量)

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 (LP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">源代码</a></li></ul> |

在求解线性规划模型时，决策变量的最优取值（`var.value`）往往只是故事的一半。在实际业务决策中，我们通常还需要了解**灵敏度分析（Sensitivity Analysis）**信息：

1. **瓶颈约束（`constr.dual` — 影子价格 Shadow Price）：** 哪些最低营养指标正在推高总成本？该指标每收紧 1 个单位，总成本会增加多少？
2. **约束盈余（`constr.slack` — 松弛量）：** 哪些约束正处于紧绑定状态（Binding），哪些约束还有充足的富余空间（Surplus）？
3. **缩减成本（`var.reducedCost` — Reduced Cost）：** 对于未被选入最优方案的食物（取值为 `0`），每份至少需要降价多少美元，才值得被纳入最优食谱？

## 问题输入数据

我们需要在 6 种食物中选择每日摄入份数（$0 \le x_i \le 4$），在满足 4 项每日最低营养需求（热量 `Calories >= 2000 kcal`、蛋白质 `Protein >= 105 g`、钙 `Calcium >= 1000 mg`、铁 `Iron >= 18 mg`）的前提下使每日饮食总成本最小化：

| 食物名称 | 单份成本 | 热量 (kcal) | 蛋白质 (g) | 钙 (mg) | 铁 (mg) | 每日最大份数 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Oats（燕麦）** | $0.60 | 150 | 5 | 20 | 1.8 | 4.0 |
| **Chicken（鸡肉）** | $2.40 | 220 | 32 | 15 | 1.2 | 4.0 |
| **Eggs（鸡蛋）** | $0.80 | 140 | 12 | 50 | 1.7 | 4.0 |
| **Milk（牛奶）** | $0.90 | 120 | 8 | 280 | 0.1 | 4.0 |
| **Spinach（菠菜）** | $1.50 | 40 | 4 | 120 | 3.5 | 4.0 |
| **Salmon（三文鱼）** | $3.60 | 200 | 25 | 20 | 0.8 | 4.0 |

## 使用 WaSHI 实现

<CodeRunner preset="diet_sensitivity">

```typescript
import { Model, minimize, dot, expr } from "@ohtaman/washi";

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

  // 每日连续摄入份数（每种食物 0 至最多 4 份）
  const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4 });

  const costs = Object.fromEntries(foods.map((f) => [f.name, f.cost]));
  const cals  = Object.fromEntries(foods.map((f) => [f.name, f.calories]));
  const prots = Object.fromEntries(foods.map((f) => [f.name, f.protein]));
  const calcs = Object.fromEntries(foods.map((f) => [f.name, f.calcium]));
  const irons = Object.fromEntries(foods.map((f) => [f.name, f.iron]));

  // 目标函数：通过点积（dot）最小化每日饮食总成本
  m.objective(minimize(dot(costs, srv)));

  // 营养下限约束：使用 expr 与 constraint() 声明式定义
  m.constraint(expr`${dot(cals, srv)} >= 2000`, "min_calories")
   .constraint(expr`${dot(prots, srv)} >= 105`,  "min_protein")
   .constraint(expr`${dot(calcs, srv)} >= 1000`, "min_calcium")
   .constraint(expr`${dot(irons, srv)} >= 18`,   "min_iron");

  const status = await m.solve();

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

## 结果解读

- **瓶颈约束（`slack == 0`, `dual > 0`）：** 热量（2000 kcal）和铁（18 mg）紧贴下界，其中铁摄入标准每提高 1 mg，每日最低饮食成本将增加 **$0.3241**。
- **有盈余的约束（`slack > 0`, `dual == 0`）：** 蛋白质（超出下限 +46.46 g）和钙（超出下限 +483.02 mg）已自然超额满足，因此它们的影子价格为 `$0`。
- **缩减成本（`Salmon`）：** 未被选入方案（`0.00`）的三文鱼（Salmon）缩减成本为 `+1.5125`，意味着每份三文鱼至少需要降价 **$1.51** 以上，才会被纳入最优食谱。
