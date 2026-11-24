## 解题思路

将每个周期的库存动态拆分为两条耦合的线性守恒等式：一条刻画物理库存 $I_t \ge 0$，另一条将当期需求拆解为实际交付 $s_t$、延期积压 $b_t \ge 0$ 与永久流失 $l_t \in [0, d_t]$，并设定边界条件 $b_{T-1} = 0$，构成纯连续线性规划最大化净利润。

## 数学模型

$$
\begin{aligned}
\max_{x, s, I, b, l \ge 0} \quad & \sum_{t=0}^{T-1} \left( r s_t - c_t x_t - h I_t - p_b b_t - p_l l_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + x_t - s_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& b_t = b_{t-1} + d_t - s_t - l_t && \forall t \;\; (b_{-1} = 0,\; b_{T-1} = 0) \\
& 0 \le x_t \le C_t, \quad 0 \le l_t \le d_t && \forall t
\end{aligned}
$$

## 核心要点

- **无需二元变量即可保证 $I_t \cdot b_t = 0$**：只要 $h > 0$ 且 $p_b > 0$，同时持有正库存与正积压订单只会白白损失 $(h + p_b)\min(I_t, b_t)$ 的利润而无法增加交付，因此最优解天然满足互补性。
- **三向权衡机制**：面对产能瓶颈或高成本时段，模型会自动比较“提前备货持有成本 $h$”、“延期交付惩罚 $p_b$”以及“放弃订单的边际损失 $r - c_t + p_l$”。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将各期的物理库存守恒等式与延期积压守恒等式分别以数组形式传给 `m.constraint()`，并通过变量上界将末期积压固定为 0。在 WaSHI 中使用 `map` 和 `expr` 构建各期平衡方程，在 PuLP 中则在循环内逐期添加等式约束。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((_, t) => {
    const prevInv = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prevInv} + ${production[t]} - ${sales[t]} - ${inventory[t]} == 0`;
  })
);
m.constraint(
  input.demands.map((demand, t) => {
    const prevBack = t === 0 ? 0 : backlog[t - 1];
    return expr`${prevBack} + ${demand} - ${sales[t]} - ${lostSales[t]} - ${backlog[t]} == 0`;
  })
);
```

**PuLP (Python)**

```python
for t in range(T):
    prev_inv = init_inv if t == 0 else inventory[t - 1]
    prev_back = 0 if t == 0 else backlog[t - 1]
    prob += prev_inv + production[t] - sales[t] == inventory[t]
    prob += prev_back + demands[t] - sales[t] - lost_sales[t] == backlog[t]
```
