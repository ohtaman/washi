## 解题思路

针对每个品目与周期建立 0-1 开机变量 $y_{i,t}$、连续产量 $x_{i,t}$ 与期末库存 $I_{i,t}$，施加逐品目物料守恒、基于剩余需求的开机门控以及包含加工与换产工时的共享机台产能约束，最小化总开机与持有成本。

## 数学模型

$$
\begin{aligned}
\min_{y \in \{0,1\}^{I \times T},\; x, I \ge 0} \quad & \sum_{i=0}^{I-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i,t} - I_{i,t} = d_{i,t} && \forall i, t \;\; (I_{i,-1} = 0) \\
& x_{i,t} \le \left(\sum_{k=t}^{T-1} d_{i,k}\right) y_{i,t} && \forall i, t \\
& \sum_{i=0}^{I-1} \left( a_i x_{i,t} + s_i y_{i,t} \right) \le H_t && \forall t
\end{aligned}
$$

## 核心要点

- **用未来剩余总需求构造紧致 Big-M**：将 $x_{i,t}$ 的上界收紧为 $\sum_{k=t}^{T-1} d_{i,k}$，在不损失最优解的前提下显著收紧 LP 松弛。
- **换产工时同样占用共享产能**：$s_i y_{i,t}$ 直接计入 $H_t$ 限制，因此合并批次既节省开机费用 $F_i$，也为瓶颈期释放宝贵的机台工时。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

除了逐品目、逐周期的库存平衡方程与基于剩余需求的开机关联约束外，还需构建每期限制所有品目加工与换产总工时的产能约束。在 WaSHI 中使用 `forEach` 和 `map` 组装数组约束，在 PuLP 中则使用 `pulp.lpSum` 表达每期总和。

**WaSHI (TypeScript)**

```ts
input.demands.forEach((itemDemands, i) => {
  itemDemands.forEach((demand, t) => {
    const prev = t === 0 ? 0 : inventory[i][t - 1];
    m.constraint(expr`${prev} + ${production[i][t]} - ${inventory[i][t]} == ${demand}`);
    const remDemand = itemDemands.slice(t).reduce((acc, d) => acc + d, 0);
    m.constraint(expr`${production[i][t]} <= ${remDemand} * ${setups[i][t]}`);
  });
});
m.constraint(
  input.capacities.map((cap, t) =>
    expr`${sum(
      input.demands.map(
        (_, i) =>
          expr`${input.unitTimes[i]} * ${production[i][t]} + ${input.setupTimes[i]} * ${setups[i][t]}`
      )
    )} <= ${cap}`
  )
);
```

**PuLP (Python)**

```python
for i in range(n_items):
    for t in range(T):
        prev = 0 if t == 0 else inventory[i][t - 1]
        prob += prev + production[i][t] - inventory[i][t] == demands[i][t]
        prob += production[i][t] <= sum(demands[i][t:]) * setups[i][t]
for t in range(T):
    prob += pulp.lpSum(
        unit_times[i] * production[i][t] + setup_times[i] * setups[i][t]
        for i in range(n_items)
    ) <= capacities[t]
```
