## アプローチ

各候補プロジェクトの採否を表す 0-1 バイナリ変数（`m.binary(...)` / `h.addBinary(...)`）を宣言し、予算上限制約 `dot(costs, selected) <= budget` のもとで期待価値の合計を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **貪欲法が最適にならない理由（0-1 ナップサック）**: コスパ（価値/費用）の高い順に選ぶだけでは、端数の予算が余ってしまい全体最適（例では価値 `36`）に届かないケースがあります。MIP ソルバーなら全組合せの中から最適集合を見つけられます。
- **0-1 変数の丸め**: 浮動小数点の許容誤差による `0.999999999` や `-0` を防ぐため、取り出し時には `Math.round(v.value!) || 0`（Python は `round(h.val(v))`）を使います。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const selected = m.binary(input.costs.length, { prefix: "sel" });

m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.objective(maximize(expr`dot(${input.values}, ${selected})`));
```

**Python (highspy)**

```python
selected = [h.addBinary(name=f"sel_{i}") for i in range(n)]

h.addConstr(h.qsum(costs[i] * selected[i] for i in range(n)) <= budget)
h.maximize(h.qsum(values[i] * selected[i] for i in range(n)))
```
