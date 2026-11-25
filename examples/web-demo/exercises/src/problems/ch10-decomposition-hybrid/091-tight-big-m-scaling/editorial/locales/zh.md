## 解题思路

为每座工厂 $i$ 引入二元开机变量 $y_i \in \{0, 1\}$ 与非负连续产量变量 $q_i \ge 0$，在满足总需求约束 $\sum_i q_i \ge D$ 及紧致关联约束 $q_i \le \min(C_i, D)\,y_i$ 的前提下最小化固定成本与变动成本之和。将上界收紧至 $\min(C_i, D)$ 可避免 $C_i > D$ 的高产能工厂在连续松弛中以极小分数开机。先求解连续 LP 松弛获取 `lpBound`，再求解 MIP 得到整数最优方案。

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

- **宽泛 Big-M 削弱 LP 松弛的机理**：在连续松弛最优解中往往满足 $y_i = q_i / M_i$，即等效边际成本为 $c_i + F_i / M_i$。若取 $M = 10^6$ 或未裁剪的原始产能（例如示例在 $D = 60$ 时的 $C_0 = 500$），固定成本项会被严重低估，导致 LP 下界大幅下降、分支定界节点数剧增。
- **基于需求上界的紧致化**：由于单位变动成本满足 $c_i \ge 0$，即便需求约束为不等式 $\sum_i q_i \ge D$，最优整数解也无需让任何工厂生产超过 $D$ 的产量。将上界收紧至 $M_i = \min(C_i, D)$ 会在保留全部最优整数解的同时显著收紧 LP 多面体，且不增加额外变量或割平面。
- **数值尺度稳定性**：避免引入 $10^6$ 以上的人为大常数还能降低单纯形基矩阵的条件数，防止浮点误差导致的“零开关小流量”现象。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 `quantities.map(...)` 中以 `Math.min(input.capacities[i], input.demand)` 作为上界一次性生成所有工厂的关联约束，随后对同一模型 `m` 先调用 `await m.relax()` 获取 LP 松弛下界，再调用 `await m.solve()` 求解整数解；在 PuLP 中则通过将 `cat` 在 `pulp.LpContinuous` 与 `pulp.LpBinary` 之间切换来分别构建连续松弛与 MIP。

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
