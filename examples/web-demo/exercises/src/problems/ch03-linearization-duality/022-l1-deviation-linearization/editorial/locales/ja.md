## アプローチ

目標からの符号付き偏差 $x_i - \tau_i$ を、非負の正偏差変数 $d_i^+ \ge 0$ と負偏差変数 $d_i^- \ge 0$ の差として $x_i - \tau_i = d_i^+ - d_i^-$ と表します。正の重み $w_i > 0$ のもとで $\sum_i w_i (d_i^+ + d_i^-)$ を最小化すると、最適解で自動的に $d_i^+ + d_i^- = |x_i - \tau_i|$ が成り立ちます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i (d_i^+ + d_i^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = \text{totalOutput}, \qquad \sum_{i=0}^{n-1} c_i x_i \le \text{budget} \\
& x_i - \tau_i = d_i^+ - d_i^- && \forall i \in \{0, \dots, n-1\} \\
& 0 \le x_i \le u_i, \quad d_i^+, d_i^- \ge 0 && \forall i
\end{aligned}
$$

## ポイント

- **なぜ $d_i^+$ と $d_i^-$ が同時に正にならないのか**: 同じ $\delta > 0$ を $d_i^+$ と $d_i^-$ の両方に足しても差 $d_i^+ - d_i^-$ は変わりませんが、目的関数が $2 w_i \delta > 0$ だけ悪化します。そのため最小化の最適解では必ず片方が $0$ になり、0-1 変数なしで $|x_i - \tau_i| = d_i^+ + d_i^-$ が厳密に表現できます。
- **片側だけでは足りない理由**: $d_i \ge x_i - \tau_i$ のように片側だけ置くと、目標より小さい場合（$x_i < \tau_i$）がペナルティなしで通ってしまいます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

総出力一致と予算上限の制約に加え、各発電ユニットの目標値との差を `dPlus[i] - dMinus[i]` で表して重み付き和を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(allocations)} == ${input.totalOutput}`, "total_output");
m.constraint(expr`dot(${input.costs}, ${allocations}) <= ${input.budget}`, "budget");
m.constraint(
  input.targets.map(
    (target, i) => expr`${allocations[i]} - ${target} == ${dPlus[i]} - ${dMinus[i]}`
  )
);
m.objective(
  minimize(expr`dot(${input.weights}, ${dPlus}) + dot(${input.weights}, ${dMinus})`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(allocations) == total_output
prob += pulp.lpDot(costs, allocations) <= budget
for i in range(n):
    prob += allocations[i] - targets[i] == d_plus[i] - d_minus[i]
prob += pulp.lpDot(weights, d_plus) + pulp.lpDot(weights, d_minus)
prob.solve(pulp.HiGHS(msg=False))
```
