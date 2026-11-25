## 解题思路

采用 Rockafellar-Uryasev (2000) 对 $\text{CVaR}_\alpha$ 的线性等价重构：记情景 $s$ 的投资组合损失为 $L_s(w) = -\sum_j r_{s,j} w_j$，声明**无上下界限制的自由变量** $\eta \in \mathbb{R}$（`lb: -Infinity`）和非负超额变量 $u_s \ge L_s(w) - \eta$，在纯 LP 框架下最小化期望损失与 $\lambda \left(\eta + \frac{1}{1-\alpha}\sum_s p_s u_s\right)$ 之和。

## 数学模型

$$
\begin{aligned}
\min_{w,\, \eta \in \mathbb{R},\, u \ge 0} \quad & -\sum_{s=0}^{S-1} p_s \left(\sum_{j=0}^{n-1} r_{s,j} w_j\right) + \lambda \left( \eta + \frac{1}{1 - \alpha} \sum_{s=0}^{S-1} p_s u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_j = 1, \quad 0 \le w_j \le w_{\max} && \forall j \\
& \sum_{j=0}^{n-1} r_{s,j} w_j + \eta + u_s \ge 0 && \forall s \in \{0, \dots, S-1\}
\end{aligned}
$$

## 核心要点

- **必须保持 $\eta$ 为自由变量（WaSHI 用 `lb: -Infinity`，PuLP 用 `lowBound=None`）**：WaSHI 的 `m.continuous` 默认下界 `lb` 为 0，因此无约束阈值必须显式传入 `{ lb: -Infinity }`；而 PuLP 的 `pulp.LpVariable` 默认 `lowBound` 本就是 `None`（无界），切勿把 `lowBound=0` 误复制到 `eta` 上，显式写出 `lowBound=None` 更能清晰表达意图。当所有情景均盈利导致损失为负（如用例 1 中 $\eta^* = -0.0428$）时，若将 $\eta$ 限制为非负，CVaR 会失真并导致次优解（-0.0596 对比 -0.1742）。
- **CVaR 的凸性优势**：直接约束分位数 VaR 需要离散 0-1 变量，而 CVaR 通过极小化上镜图化为完全连续的凸线性规划。
- 概念参考：[指南与术语表 — 上下界](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将辅助阈值变量 `eta` 声明为 `{ lb: -Infinity, ub: Infinity }` 自由变量，使用 `input.returns.map(...)` 一次性注册各情景的铰链不等式，并组装 CVaR 的线性表达式。

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
