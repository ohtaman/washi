# 栄養問題と感度分析（潜在価格・スラック・被約費用）

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 線形計画問題 (LP) | HiGHS (標準) | `m.continuous()`, `m.constraint()`, `constr.dual`, `constr.slack`, `var.reducedCost` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=diet_sensitivity">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">ソースコード</a></li></ul> |

線形計画モデルを解いたあとに **感度分析（Sensitivity Analysis）** を行うと、基準値・上限・単価の変化に対する最適コストの変化量が分かります。

1. **潜在価格（`constr.dual` / Shadow Price）:** 制約の右辺を 1 単位増やしたときの、最適コストの限界変化量です。
2. **スラック（`constr.slack`）:** 制約の余裕量（または超過量）を表し、`0` のとき制約が等号で成立するボトルネック（活性制約）であることを示します。
3. **被約費用（`var.reducedCost`）:** 下限または上限に張り付いた変数の値を 1 単位増やしたときの、最適コストの限界変化量です。

## 入力データ

6 種類の食品それぞれの 1 日あたり摂取量（$0 \le x_i \le 4$ 食分、連続値）を決定し、1 日の食費合計を最小化します。満たすべき最低基準は、カロリー `2000 kcal` 以上、タンパク質 `105 g` 以上、カルシウム `1000 mg` 以上、鉄分 `18 mg` 以上の 4 項目です。

| 食品名 | 1 食あたりコスト | カロリー (kcal) | タンパク質 (g) | カルシウム (mg) | 鉄分 (mg) | 1 日の上限（食） |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Oats（オートミール）** | $0.60 | 150 | 5 | 20 | 1.8 | 4.0 |
| **Chicken（鶏肉）** | $2.40 | 220 | 32 | 15 | 1.2 | 4.0 |
| **Eggs（卵）** | $0.80 | 140 | 12 | 50 | 1.7 | 4.0 |
| **Milk（牛乳）** | $0.90 | 120 | 8 | 280 | 0.1 | 4.0 |
| **Spinach（ほうれん草）** | $1.50 | 40 | 4 | 120 | 3.5 | 4.0 |
| **Salmon（サーモン）** | $3.60 | 200 | 25 | 20 | 0.8 | 4.0 |

## WaSHI による実装

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

  // 各食品の 1 日あたり摂取量（0 〜 4 食分）
  const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4 });

  const costs = Object.fromEntries(foods.map((f) => [f.name, f.cost]));
  const cals  = Object.fromEntries(foods.map((f) => [f.name, f.calories]));
  const prots = Object.fromEntries(foods.map((f) => [f.name, f.protein]));
  const calcs = Object.fromEntries(foods.map((f) => [f.name, f.calcium]));
  const irons = Object.fromEntries(foods.map((f) => [f.name, f.iron]));

  // 目的関数: 1 日の食費合計を最小化
  m.objective(minimize(expr`dot(${costs}, ${srv})`));

  // 栄養基準の制約
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

## 結果の解釈

HiGHS は `"Optimal"` を返し、1 日の最小食費は **`$13.66`** になります（最適摂取量は `Oats`・`Eggs`・`Milk` が各 `4.00` 食、`Chicken` が `1.55` 食、`Spinach` が `0.50` 食、`Salmon` が `0.00` 食）。

### ボトルネック制約（`slack == 0`, `dual > 0`）

`min_calories` と `min_iron` が等号で成立しており、潜在価格はカロリーが `$0.0091/kcal`、鉄分が `$0.3241/mg` です。鉄分の必要量を `1 mg` 増やすと、最小食費は `$0.3241` 増加します。

### 余剰のある制約（`|slack| > 0`, `dual == 0`）

`>=` 制約では `右辺 - 左辺` として負の `slack`（タンパク質 `-46.46`、カルシウム `-483.02`）が返るため、コードでは `Math.abs(c.slack)` を余剰量として出力しています。タンパク質は `46.46 g`、カルシウムは `483.02 mg` の余裕があるため、潜在価格はどちらも `0` です。

### 下限に張り付いた変数（不採用品目）の被約費用（`Salmon`）

不採用（`value = 0.00`）の `Salmon` は `reducedCost = +1.5125` です。1 食あたりの単価が `$1.5125`（約 `$1.51`）以上下がらない限り、最適メニューには採用されません。

### 上限に張り付いた変数の負の被約費用（`Oats`, `Eggs`, `Milk`）

3 品目が 1 日の上限 `ub = 4.0` に達しています。最小化 LP では、上限に張り付いた変数の被約費用は負になり、`ub` を 1 単位引き上げたときのコスト変化量（絶対値が節約額）を表します。

- `Oats`: `reducedCost = -1.3546`（上限を 1 食分引き上げると約 `$1.35/日` 節約）
- `Eggs`: `reducedCost = -1.0307`（上限を 1 食分引き上げると約 `$1.03/日` 節約）
- `Milk`: `reducedCost = -0.2294`（上限を 1 食分引き上げると約 `$0.23/日` 節約）

### 最適基底の有効範囲

`dual` と `reducedCost` は、現在の最適基底（Optimal Basis）が保たれる範囲での局所的な変化率です。上限や基準値を大きく動かして活性制約や張り付く境界が切り替わると、限界変化率も新しい値に変わります。
