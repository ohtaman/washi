## アプローチ

第 9 章の定式化パターンを 1 つの 2 段階 MIP に統合します。第 1 段階の事前契約 $y_j$ に Bertsimas-Sim 双対変数（$z, p_j$）でロバスト容量保証を課し、各シナリオの復旧計画 $w_{s,j}$ と $y_j$ の差を線形化した変数 $d_{s,j} \ge |w_{s,j} - y_j|$ と弾力欠品スラック $u_s \ge 0$ を用いて期待総費用を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} F_j y_j + \sum_{s=0}^{S-1} p_s \left( C_{\text{sw}} \sum_{j=0}^{n-1} d_{s,j} + C_{\text{sh}} u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} C_j y_j - \Gamma z - \sum_{j=0}^{n-1} p_j \ge C_{\text{rob}}, \quad z + p_j \ge \delta_j y_j && \forall j \\
& w_{s,j} = 0 && \forall (s,j): \text{offline}_{s,j} = 1 \\
& d_{s,j} \ge w_{s,j} - y_j, \quad d_{s,j} \ge y_j - w_{s,j} && \forall s, j \\
& \sum_{j=0}^{n-1} C_j w_{s,j} + u_s \ge D_s, \quad y_j, w_{s,j} \in \{0, 1\},\; z, p_j, d_{s,j}, u_s \ge 0
\end{aligned}
$$

## ポイント

- **2つの決定変数ベクトルのハミング距離の線形化**: `#085` と異なり基準側 $y_j$ も決定変数であるため、各セルの絶対値差を $d_{s,j} \ge w_{s,j} - y_j$ と $d_{s,j} \ge y_j - w_{s,j}$ の 2 本の線形不等式で表現します（$C_{\text{sw}} > 0$ より最適解で正確に一致します）。
- **ロバスト＋確率＋弾力制約の相乗効果**: Bertsimas-Sim 制約が脆い事前構成を排除し、確率リコースが切替コストと予備投資の釣り合いを決め（Case 2）、弾力欠品変数が稀な極端需要への過剰投資を抑えます（Case 3）。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

第 1 段階のロバスト容量制約は `input.dropAmounts.map(...)` で双対制約を登録し、各シナリオの復旧計画と事前契約の差は `w.flatMap(...)` でハミング距離の線形不等式ペアを一括生成します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.capacities}, ${y}) - ${input.gamma} * ${z} - sum(${p}) >= ${input.robustMinCap}`);
m.constraint(input.dropAmounts.map((drop, j) => expr`${z} + ${p[j]} >= ${drop} * ${y[j]}`));
m.constraint(
  w.flatMap((row, s) =>
    row.flatMap((wsj, j) => [expr`${diff[s][j]} >= ${wsj} - ${y[j]}`, expr`${diff[s][j]} >= ${y[j]} - ${wsj}`])
  )
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(capacities, y) - gamma * z - pulp.lpSum(p) >= robust_min_cap
for j in range(n):
    prob += z + p[j] >= drop_amounts[j] * y[j]
for s in range(S):
    for j in range(n):
        prob += diff[s][j] >= w[s][j] - y[j]
        prob += diff[s][j] >= y[j] - w[s][j]
```
