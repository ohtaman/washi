## アプローチ

各発電機の発電量を連続決定変数 $x_i \in [0, u_i]$（`capacities[i]` を変数の上界 `ub` に設定）とし、最低需要制約（`>=`）と燃料・排出枠の上限制約（`<=`）のもとで総発電コスト $\sum_i c_i x_i$ を最小化する LP として定式化します。各制約の双対変数は右辺値に対する最小コストの限界変化率を表すため、最低需要制約と燃料・排出枠の上限制約への参照を保持したまま HiGHS で解き、WaSHI では `c.dual`、PuLP では `c.pi` を読み取ります。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} A_{ki} x_i \ge r_k && [\text{dual } y_k \ge 0] \quad \forall k \\
& \sum_{i=0}^{n-1} E_{li} x_i \le b_l && [\text{dual } \mu_l \le 0] \quad \forall l \\
& 0 \le x_i \le u_i && \forall i
\end{aligned}
$$

## ポイント

- **最小化 LP における潜在価格の符号と局所性**: 非退化な最適解の近傍では、潜在価格は現在の最適基底内における局所的な変化率 $\partial z^* / \partial \text{rhs}$ を表します（主問題が退化している場合、双対最適解は一意とは限らず左右の片側変化率が一致しないこともあります）。タイトな `>=` 最低需要制約の右辺 $r_k$ を増やすと実行可能領域が狭まり最小コストは下がり得ないため $y_k \ge 0$、タイトな `<=` 燃料・排出枠の上限制約の右辺 $b_l$ を増やすと実行可能領域が広がり最小コストは上がり得ないため $\mu_l \le 0$ になります。`minimize` / `LpMinimize` では、WaSHI の `c.dual` と PuLP（HiGHS）の `c.pi` のいずれもこの $\partial z^* / \partial \text{rhs}$ の微分符号をそのまま返します。
- **相補性と変数上界の区別**: 正の余裕（スラック）がある制約の潜在価格は必ず $0$ になります。また `capacities[i]` を行制約ではなく変数の `ub` に置くことで、行の双対変数が `minRequirements` と `maxResources` に正確に対応します。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

最低需要制約と燃料・排出枠の上限制約それぞれの制約ハンドルを配列に保持したまま `m.solve()` を実行し、求解後に各制約の `.dual`（PuLP では `.pi`）を順番に読み取ります。

**WaSHI (TypeScript)**

```ts
const reqConstrs = input.minRequirements.map((req, k) =>
  m.constraint(expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`, `req_${k}`)
);
const capConstrs = input.maxResources.map((cap, l) =>
  m.constraint(expr`dot(${input.resourceUsages[l]}, ${quantities}) <= ${cap}`, `cap_${l}`)
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const duals = [...reqConstrs, ...capConstrs].map((c) => c.dual!);
```

**PuLP (Python)**

```python
req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_requirements)]
cap_constrs = [pulp.lpDot(resource_usages[l], quantities) <= cap for l, cap in enumerate(max_resources)]
for con in req_constrs + cap_constrs:
    prob += con
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
duals = [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs]
```
