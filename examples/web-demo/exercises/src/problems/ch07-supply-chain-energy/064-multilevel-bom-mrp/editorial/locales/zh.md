## 解题思路

将单品目批量模型扩展到物料×周期网格：在 $t$ 期投产父件 $x_{j,t}$ 会于当期 $t$ 立即扣减子件 $i$ 的库存（即相关需求 $\sum_j r_{i,j} x_{j,t}$），而物料 $i$ 自身的投产则延迟 $L_i$ 期、作为 $x_{i, t-L_i}$ 计入第 $t$ 期的入库平衡中。

## 数学模型

$$
\begin{aligned}
\min_{y \in \{0,1\}^{N \times T},\; x \in \mathbb{Z}_{\ge 0}^{N \times T},\; I \ge 0} \quad & \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + c_i x_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i, t - L_i} - D_{i,t} - \sum_{j=0}^{N-1} r_{i,j} x_{j,t} = I_{i,t} && \forall i, t \\
& 0 \le x_{i,t} \le C_i y_{i,t} && \forall i, t
\end{aligned}
$$

其中当 $t < L_i$ 时约定 $x_{i, t - L_i} \equiv 0$，且 $I_{i,-1} = \text{initialInventory}[i]$。

## 核心要点

- **错位入库与当期齐套耗料**：父件在 $t$ 期投产时立即消耗 $t$ 期的子件库存，而其产出在 $t + L_j$ 期才可用。仅凭这一时间下标偏移即可串联任意深度的有向无环 BOM。
- **批量决策沿供应链向上游传导**：下游合并批次节省开机费 $F_0$ 会造成投产期对上游物料的脉冲式需求，进而促使上游半成品在更早期提前备库平滑产能。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

为每个品目和周期构建开机关联约束，以及包含提前期错位入库与 BOM 展开相关需求的库存平衡方程。在 WaSHI 中从 `bom[i]` 提取非零父件项并用 `sum()` 求和，在 PuLP 中则用列表推导式表达相关需求。

**WaSHI (TypeScript)**

```ts
input.externalDemands.forEach((extRow, i) => {
  const L = input.leadTimes[i];
  extRow.forEach((extDemand, t) => {
    m.constraint(expr`${production[i][t]} <= ${input.capacities[i]} * ${setups[i][t]}`);
    const prevInv = t === 0 ? input.initialInventory[i] : inventory[i][t - 1];
    const arrival = t >= L ? production[i][t - L] : 0;
    const depTerms = input.bom[i]
      .map((ratio, j) => (ratio !== 0 ? expr`${ratio} * ${production[j][t]}` : null))
      .filter((term): term is NonNullable<typeof term> => term !== null);
    const depExpr = depTerms.length > 0 ? sum(depTerms) : 0;
    m.constraint(expr`${prevInv} + ${arrival} - ${depExpr} - ${inventory[i][t]} == ${extDemand}`);
  });
});
```

**PuLP (Python)**

```python
for i in range(n_items):
    L = lead_times[i]
    for t in range(T):
        prob += production[i][t] <= capacities[i] * setups[i][t]
        prev_inv = init_inv[i] if t == 0 else inventory[i][t - 1]
        arrival = production[i][t - L] if t >= L else 0
        dep_demand = pulp.lpSum(
            bom[i][j] * production[j][t] for j in range(n_items) if bom[i][j] != 0
        )
        prob += prev_inv + arrival - dep_demand - inventory[i][t] == ext_demands[i][t]
```
