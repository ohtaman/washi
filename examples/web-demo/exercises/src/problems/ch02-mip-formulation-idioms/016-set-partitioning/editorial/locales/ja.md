## アプローチ

$n$ 個のタスク（`numTasks`）と、運行コスト $c_j$（`costs[j]`）・担当タスク集合 $R_j$（`routes[j]`）を持つ $m$ 本の候補ルートに対し、各ルートの採択を表す 0-1 変数 $x_j$（`selected[j]`）を用意します。各タスクに対する被覆制約を不等式（`>= 1`）ではなく厳密な等式（`== 1`）として課したうえで、総運行コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in R_j} x_j = 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## ポイント

- **等式 (`== 1`) と不等式 (`>= 1`) の決定的違い**: 例題ではルート 0（`[0, 1, 2]`、コスト 5）とルート 1（`[2, 3, 4]`、コスト 5）を選べば集合被覆としてはコスト 10 で済みますが、タスク 2 が 2 回重複するため集合分割では不可となり、ルート 1 とルート 2 を選ぶコスト 11 の厳密分割が最適解になります。
- **乗務員スケジューリング・配送計画の基礎**: `>= 1` を `== 1` に変えるだけで列生成法などの主問題としても頻出する集合分割定式化になります。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各タスク `i` ごとに `input.routes[j]` が `i` を含むようなルートの選択変数 `selected[j]` を抽出し、その和がちょうど 1 になる等式制約を生成します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numTasks }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.routes[j].includes(i)))} == 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_tasks):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in routes[j]) == 1
prob += pulp.lpDot(costs, selected)
```
