## アプローチ

各防災設備を導入するかどうかを **0-1 バイナリ変数** $x_i \in \{0, 1\}$ として定義し、総費用が予算 $B$ 以下になる制約のもとで期待スコアの合計を最大化します。WaSHI（および PuLP）では、`m.binary(...)` / `LpBinary` と `dot` / `lpDot` で記述できます。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **貪欲法が最適にならない理由（0-1 ナップサック）**: コスパ（スコア/費用）の高い順に選ぶだけでは、端数の予算が余ってしまい全体最適（例ではスコア 36）に届かないケースがあります。MIP ソルバーなら分枝限定法と緩和下界・上界による枝刈りによって、全組合せを列挙せずに大域的最適集合を厳密に求められます。
- **0-1 変数の取り出し**: PuLP (Python) では浮動小数点の許容誤差により 0.999999999 や -0.0 が返ることがあるため、取り出し時は `round(pulp.value(v))` で整数へ丸めます。WaSHI では `Binary` 変数の `v.value` は内部で整数へ自動正規化されるため `v.value!` をそのまま使えます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各設備の選択を `m.binary(...)`（PuLP は `cat=pulp.LpBinary`）で表し、予算制約と目的関数の和を `dot` / `pulp.lpDot` で簡潔に記述します。

**WaSHI (TypeScript)**

```ts
const selected = m.binary(input.costs.length, { prefix: "sel" });

m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.objective(maximize(expr`dot(${input.values}, ${selected})`));
```

**PuLP (Python)**

```python
selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

prob += pulp.lpDot(costs, selected) <= budget
prob += pulp.lpDot(values, selected)
prob.solve(pulp.HiGHS(msg=False))
```
