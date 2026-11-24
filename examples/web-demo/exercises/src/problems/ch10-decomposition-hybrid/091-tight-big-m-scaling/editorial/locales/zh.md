## 解题思路

对每座工厂计算紧致有效上界 $M_i = \min(\text{capacities}[i], \text{demand})$，避免 `capacities[i] > demand` 时在 LP 松弛中出现极小分数开机率。先调用 `await m.relax()` 求解连续松弛获得 `lpBound`，再调用 `await m.solve()` 求解整数最优方案。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i y_i + c_i q_i \right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} q_i \ge D \\
& 0 \le q_i \le \min(C_i, D) \cdot y_i && \forall i \in \{0, \dots, n-1\} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **宽泛 Big-M 削弱 LP 松弛的机理**：在连续松弛最优解中往往满足 $y_i = q_i / M_i$，即等效边际成本为 $c_i + F_i / M_i$。当总需求 $D = 60$ 而 $M = 10^6$ 或未裁剪的 $C_i = 500$ 时，固定成本项被严重低估，导致 LP 下界大幅下降、分支定界节点数剧增。
- **基于实例上界的紧致化**：由于总需求仅为 $D$，任何可行方案都不可能让单厂产量超过 $D$。取 $M_i = \min(C_i, D)$ 可在不排除任何整数可行解的前提下显著收紧 LP 多面体。
- **数值尺度稳定性**：避免引入 $10^6$ 以上的人为大常数还能降低单纯形基矩阵的条件数，防止浮点误差导致的“零开关小流量”现象。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 `quantities.map(...)` 中以 `Math.min(input.capacities[i], input.demand)` 作为上界一次性生成所有工厂的关联约束，随后对同一模型 `m` 先调用 `await m.relax()` 获取 LP 松弛下界，再调用 `await m.solve()` 求解整数解。

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => {
    const tightM = Math.min(input.capacities[i], input.demand);
    return expr`${qty} <= ${tightM} * ${open[i]}`;
  })
);
m.constraint(expr`sum(${quantities}) >= ${input.demand}`, "demand");
m.objective(minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${quantities})`));

await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
cat = pulp.LpContinuous if relax else pulp.LpBinary
open_vars = [pulp.LpVariable(f"open_{i}", 0, 1, cat=cat) for i in range(n)]
for i in range(n):
    tight_m = min(capacities[i], demand)
    prob += quantities[i] <= tight_m * open_vars[i]
```
