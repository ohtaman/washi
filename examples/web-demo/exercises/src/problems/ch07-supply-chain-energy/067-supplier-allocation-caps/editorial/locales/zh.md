## 解题思路

将供应商启用二进制变量 $y_s \in \{0,1\}$ 与带单厂份额上界的连续采购量 $q_{s,p} \in [0, \alpha D_p]$ 组合，再施加启用家数上下界及每家总订购量的半连续区间约束 $L_s y_s \le \sum_p q_{s,p} \le U_s y_s$，实现低成本且合规的多源采购。

## 数学模型

$$
\begin{aligned}
\min_{y \in \{0,1\}^S,\; q \ge 0} \quad & \sum_{s=0}^{S-1} F_s y_s + \sum_{s=0}^{S-1} \sum_{p=0}^{P-1} c_{s,p} q_{s,p} \\
\text{s.t.} \quad & K_{\min} \le \sum_{s=0}^{S-1} y_s \le K_{\max} \\
& L_s y_s \le \sum_{p=0}^{P-1} q_{s,p} \le U_s y_s && \forall s \\
& \sum_{s=0}^{S-1} q_{s,p} \ge D_p && \forall p \\
& 0 \le q_{s,p} \le \alpha D_p && \forall s, p
\end{aligned}
$$

## 核心要点

- **用变量上界直接刻画份额分散**：把 $q_{s,p} \le \alpha D_p$ 直接写进变量上界，无需增加 $S \times P$ 行额外约束，即可强制每家工厂至少由 $\lceil 1/\alpha \rceil$ 家供应商共同供货。
- **供应商级的半连续门控**：$L_s y_s \le \sum_p q_{s,p} \le U_s y_s$ 配合 $q_{s,p} \ge 0$ 同时保证未选中供应商各厂分配全为零，且选中供应商必定满足最低合同采购量 $L_s$。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

在变量声明时将份额上限直接写入上界 `ub`，再添加启用供应商数量上下限以及各供应商的半连续订购量约束（最小起订量与最大供应上限）。在 WaSHI 中通过 `m.continuous` 的选项指定 `ub`，并用 `forEach` 构建各供应商的总订购量约束。

**WaSHI (TypeScript)**

```ts
const allocations = input.fixedCosts.map((_, s) =>
  input.demands.map((demand, p) =>
    m.continuous(`q_${s}_${p}`, { lb: 0, ub: input.maxShare * demand })
  )
);
m.constraint(expr`${sum(active)} >= ${input.minSuppliers}`);
m.constraint(expr`${sum(active)} <= ${input.maxSuppliers}`);
allocations.forEach((row, s) => {
  const totalOrder = sum(row);
  m.constraint(expr`${totalOrder} >= ${input.minOrders[s]} * ${active[s]}`);
  m.constraint(expr`${totalOrder} <= ${input.maxOrders[s]} * ${active[s]}`);
});
```

**PuLP (Python)**

```python
prob += pulp.lpSum(active) >= min_suppliers
prob += pulp.lpSum(active) <= max_suppliers
for s in range(n_sup):
    total_order = pulp.lpSum(allocations[s])
    prob += total_order >= min_orders[s] * active[s]
    prob += total_order <= max_orders[s] * active[s]
```
