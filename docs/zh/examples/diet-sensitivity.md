# 营养问题与灵敏度分析（影子价格・松弛量・缩减成本）

| 问题类型 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 线性规划 (LP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `constr.dual`, `constr.slack`, `var.reducedCost` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=diet_sensitivity">在 Playground 中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">源代码</a></li></ul> |

求解线性规划模型后，**灵敏度分析（Sensitivity Analysis）** 可以说明需求、上限或价格变化如何影响最优总成本：

1. **影子价格（`constr.dual` / Shadow Price）：** 约束右端项增加 1 个单位时，最优目标值的边际变化量。
2. **松弛量（`constr.slack`）：** 约束距离边界的富余（或盈余）空间，为 `0` 时表示紧绑定瓶颈。
3. **缩减成本（`var.reducedCost`）：** 处于下界或上界的变量取值增加 1 个单位时，最优目标值的边际变化量。

## 问题输入数据

我们为 6 种食物分别确定每日摄入份数（$0 \le x_i \le 4$ 份，连续值），使每日总餐费最小。方案必须满足 4 项每日最低营养标准：热量不少于 `2000 kcal`、蛋白质不少于 `105 g`、钙不少于 `1000 mg`、铁不少于 `18 mg`。

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
import { Model, minimize, expr } from "@ohtaman/washi";

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

  // 每日连续摄入份数（每种食物 0 至 4 份）
  const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4 });

  const costs = Object.fromEntries(foods.map((f) => [f.name, f.cost]));
  const cals  = Object.fromEntries(foods.map((f) => [f.name, f.calories]));
  const prots = Object.fromEntries(foods.map((f) => [f.name, f.protein]));
  const calcs = Object.fromEntries(foods.map((f) => [f.name, f.calcium]));
  const irons = Object.fromEntries(foods.map((f) => [f.name, f.iron]));

  // 目标函数：最小化每日饮食总成本
  m.objective(minimize(expr`dot(${costs}, ${srv})`));

  // 营养下限约束
  const nutConstraints = [
    m.constraint(expr`dot(${cals}, ${srv}) >= 2000`, "min_calories"),
    m.constraint(expr`dot(${prots}, ${srv}) >= 105`,  "min_protein"),
    m.constraint(expr`dot(${calcs}, ${srv}) >= 1000`, "min_calcium"),
    m.constraint(expr`dot(${irons}, ${srv}) >= 18`,   "min_iron"),
  ];

  const status = await m.solve();

  console.log(`Status: ${status}, Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  console.log("--- Food Servings & Reduced Costs ---");
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`  ${f.name.padEnd(8)}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  console.log("--- Nutritional Constraints (Dual & Slack) ---");
  for (const c of nutConstraints) {
    console.log(`  ${c.name.padEnd(13)}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
  }
}

runDietSensitivity();
```

</CodeRunner>

## 结果解读

HiGHS 返回 `"Optimal"`，每日最低总餐费为 **`$13.66`**（最优摄入份数为 `Oats`、`Eggs`、`Milk` 各 `4.00` 份，`Chicken` `1.55` 份，`Spinach` `0.50` 份，`Salmon` `0.00` 份）。

### 瓶颈约束（`slack == 0`, `dual > 0`）

`min_calories` 和 `min_iron` 均在等号处紧绑定，对应的影子价格分别为 `$0.0091/kcal` 和 `$0.3241/mg`。将每日铁标准提高 `1 mg`，最低餐费会增加 `$0.3241`。

### 有盈余的约束（`|slack| > 0`, `dual == 0`）

对于 `>=` 约束，HiGHS 按 `右端项 - 左端项` 计算并返回负的 `slack`（蛋白质为 `-46.46`，钙为 `-483.02`），因此代码通过 `Math.abs(c.slack)` 打印盈余量。蛋白质盈余 `46.46 g`，钙盈余 `483.02 mg`，两项约束的影子价格均为 `0`。

### 处于下界变量的缩减成本（`Salmon`）

未被选中的 `Salmon`（`value = 0.00`）缩减成本为 `+1.5125`。每份单价需下降至少 `$1.5125`（约 `$1.51`），它才会被纳入最优食谱。

### 处于上界变量的负缩减成本（`Oats`, `Eggs`, `Milk`）

共有 3 种食物达到每日份数上限 `ub = 4.0`。在最小化 LP 中，紧贴上界变量的缩减成本为负值，表示将 `ub` 提高 1 单位时的每日成本边际变化量（绝对值为节省金额）：

- `Oats`：`reducedCost = -1.3546`（上限提高 1 份可节省约 `$1.35/天`）
- `Eggs`：`reducedCost = -1.0307`（上限提高 1 份可节省约 `$1.03/天`）
- `Milk`：`reducedCost = -0.2294`（上限提高 1 份可节省约 `$0.23/天`）

### 最优基稳定区间

`dual` 与 `reducedCost` 只在当前最优单纯形基（Optimal Basis）不变的局部范围内有效。若边界或右端项变动过大并导致有效约束集合切换，这些边际变化率也会随之改变。
