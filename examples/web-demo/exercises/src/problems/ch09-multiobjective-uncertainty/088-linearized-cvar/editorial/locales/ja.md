## アプローチ

Rockafellar-Uryasev (2000) の $\text{CVaR}_\alpha$ 線形再定式化を用います。各シナリオ $s$ のポートフォリオ損失を $L_s(w) = -\sum_j r_{s,j} w_j$ とおき、上下界を持たない自由変数 $\eta \in \mathbb{R}$（`lb: -Infinity`）と非負の超過変数 $u_s \ge L_s(w) - \eta$ を導入して、期待損失と $\lambda \left(\eta + \frac{1}{1-\alpha}\sum_s p_s u_s\right)$ の和を純 LP として最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{w,\, \eta \in \mathbb{R},\, u \ge 0} \quad & -\sum_{s=0}^{S-1} p_s \left(\sum_{j=0}^{n-1} r_{s,j} w_j\right) + \lambda \left( \eta + \frac{1}{1 - \alpha} \sum_{s=0}^{S-1} p_s u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_j = 1, \quad 0 \le w_j \le w_{\max} && \forall j \\
& \sum_{j=0}^{n-1} r_{s,j} w_j + \eta + u_s \ge 0 && \forall s \in \{0, \dots, S-1\}
\end{aligned}
$$

## ポイント

- **$\eta$ を必ず自由変数にする（WaSHI は `lb: -Infinity`、PuLP は `lowBound=None`）**: WaSHI の `m.continuous` は既定で下界 `lb` が 0 となるため、無制約のしきい値には `{ lb: -Infinity }` の明示が必須です。一方 PuLP の `pulp.LpVariable` は既定で `lowBound=None`（無制約）なので、`eta` に `lowBound=0` を誤ってコピーせず、意図を明確にするため `lowBound=None` と明記するのが安全です。Case 1 のようにテールシナリオでもリターンが正（損失が負、$\eta^* = -0.0428$）のとき、$\eta \ge 0$ と制限すると CVaR が歪み最適解に到達できません（-0.0596 対 -0.1742）。
- **VaR の非凸性と CVaR の凸性**: VaR（分位点）の直接制約は 0-1 変数を必要としますが、CVaR は整数変数ゼロの厳密な凸線形計画として高速に解けます。
- 用語の確認: [ガイド・用語集 — 上下界](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

補助しきい値変数 `eta` を `{ lb: -Infinity, ub: Infinity }` で自由変数として宣言し、`input.returns.map(...)` で各シナリオのヒンジ不等式を一括登録して CVaR の線形表現を組み立てます。

**WaSHI (TypeScript)**

```ts
const w = m.continuous(n, { lb: 0, ub: input.maxWeight, prefix: "w" });
const eta = m.continuous("eta", { lb: -Infinity, ub: Infinity });
const u = m.continuous(S, { lb: 0, prefix: "u" });

m.constraint(expr`sum(${w}) == 1`, "budget");
m.constraint(input.returns.map((row, s) => expr`dot(${row}, ${w}) + ${eta} + ${u[s]} >= 0`));
const cvarExpr = expr`${eta} + ${1 / (1 - input.alpha)} * dot(${input.probs}, ${u})`;
```

**PuLP (Python)**

```python
w = [pulp.LpVariable(f"w_{j}", lowBound=0, upBound=max_weight) for j in range(n)]
eta = pulp.LpVariable("eta", lowBound=None, upBound=None)
u = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]
prob += pulp.lpSum(w) == 1
for s in range(S):
    prob += pulp.lpDot(returns[s], w) + eta + u[s] >= 0
cvar_expr = eta + (1.0 / (1.0 - alpha)) * pulp.lpDot(probs, u)
```
