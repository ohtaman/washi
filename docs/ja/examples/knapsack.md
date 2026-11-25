# 0-1 ナップサック問題 (Binary MIP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 0-1 整数計画 (Binary MIP) | HiGHS (標準) | `m.binary()`, `m.constraint()`, `expr` (`dot`), `maximize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=knapsack">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts">ソースコード</a></li></ul> |

各アイテムの重さと価値が与えられたとき、総重量が上限を超えない範囲で価値の合計が最大となるアイテムの組み合わせを選ぶ組合せ最適化問題です。

## 数理モデルの定式化

アイテム $i$ の価値を $v_i$、重さを $w_i$、重量上限を $W$ とし、各アイテム $i$ を選ぶときに $x_i = 1$、選ばないときに $x_i = 0$ となる 0-1 決定変数を定義します。

$$\begin{aligned}
\text{Maximize} \quad & \sum_{i} v_i x_i & (\text{価値の合計}) \\
\text{Subject to} \quad & \sum_{i} w_i x_i \le W & (\text{重量の上限}) \\
& x_i \in \{0, 1\} \quad \forall i
\end{aligned}$$

## WaSHI による実装

<CodeRunner preset="knapsack">

```typescript
import { Model, maximize, expr } from "@ohtaman/washi";

async function runKnapsack() {
  const m = new Model("Knapsack");

  // weight: kg, value: $
  const items = [
    { name: "Laptop",   weight: 3, value: 50 },
    { name: "Camera",   weight: 2, value: 40 },
    { name: "Drone",    weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent",     weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // 0-1 決定変数: x[name] (0 または 1)
  const x = m.binary(items.map((it) => it.name));

  const values = Object.fromEntries(items.map((it) => [it.name, it.value]));
  const weights = Object.fromEntries(items.map((it) => [it.name, it.weight]));

  // 目的関数: 選んだアイテムの価値の合計を最大化
  m.objective(maximize(expr`dot(${values}, ${x})`));

  // 重量上限の制約
  m.constraint(expr`dot(${weights}, ${x}) <= ${maxCapacity}`, "capacity_limit");

  const status = await m.solve();
  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  const packed = items.filter((it) => x[it.name].value === 1).map((it) => it.name);
  console.log("Packed Items:", packed.join(", "));
}

runKnapsack();
```

</CodeRunner>

## 解の読み解きとポイント

- **最適解の確認**: `Camera`（`2 kg`, `$40`）、`Drone`（`4 kg`, `$65`）、`FirstAid`（`1 kg`, `$15`）を選ぶと合計重量がちょうど `7 kg` になり、価値の合計は最大の `$120` になります。
- **`m.binary(names)` と `dot()` による簡潔な記述**: アイテム名の配列を `m.binary()` に渡すと名前付き 0-1 変数の辞書を一括作成できます。さらに `expr` 内の `dot()` を使うと、ループを書かずに同じキーに対応する係数と変数の内積（重み付き和）を 1 行で記述できます。
