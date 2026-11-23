## 解题思路

在节点 0-1 变量 $y_v$（固定 $y_0 = 1$）与无向边变量 $w_e$ 之上，为每条边引入正反两个方向的有向开关 $z_e^{\to}, z_e^{\leftarrow}$ 与连续流量 $f_e^{\to}, f_e^{\leftarrow} \le (n-1) z$。通过从根节点 0 向每个被选节点 $v \ge 1$ 输送 1 单位虚拟流，用纯粹线性约束严格保证连通性并杜绝孤立子图。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{v=0}^{n-1} p_v y_v - \sum_{e \in E} c_e w_e \\
\text{s.t.} \quad & y_0 = 1, \quad w_e \le y_u, \quad w_e \le y_v, \quad z_e^{\to} + z_e^{\leftarrow} \le w_e && \forall e=(u,v) \in E \\
& 0 \le f_e^{\to} \le (n-1) z_e^{\to}, \quad 0 \le f_e^{\leftarrow} \le (n-1) z_e^{\leftarrow} && \forall e \in E \\
& \text{outflow}(0) - \text{inflow}(0) = \sum_{v=1}^{n-1} y_v, \quad \text{inflow}(v) - \text{outflow}(v) = y_v && \forall v \ge 1
\end{aligned}
$$

## 核心要点

- **局部度数约束无法保证全局连通**：仅有 $w_e \le y_u, y_v$ 或要求入选节点度数 $\ge 1$ 时，求解器仍可挑出脱离根节点 0 的孤立高收益小团（例如只连结 `{3, 4}`）。
- **单商品流即连通性证明**：因为只有根节点 0 能产生流量且流量只能沿着已启用边流动，任何满足净流入等于 1 的选中节点必存在一条由已启用边构成的从 0 出发的可达路径。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

通过 `input.edges.forEach` 为每条无向边统一注册两端点选择耦合约束、方向选择互斥约束以及容量为 $(n - 1)$ 的虚拟流量上界约束。

**WaSHI (TypeScript)**

```ts
input.edges.forEach((e, idx) => {
  m.constraint(expr`${w[idx]} <= ${y[e.u]}`);
  m.constraint(expr`${w[idx]} <= ${y[e.v]}`);
  m.constraint(expr`${zFwd[idx]} + ${zRev[idx]} <= ${w[idx]}`);
  m.constraint(expr`${fFwd[idx]} <= ${n - 1} * ${zFwd[idx]}`);
  m.constraint(expr`${fRev[idx]} <= ${n - 1} * ${zRev[idx]}`);
});
```

**PuLP (Python)**

```python
for i, e in enumerate(edges):
    prob += w[i] <= y[e["u"]]
    prob += w[i] <= y[e["v"]]
    prob += z_fwd[i] + z_rev[i] <= w[i]
    prob += f_fwd[i] <= (n - 1) * z_fwd[i]
    prob += f_rev[i] <= (n - 1) * z_rev[i]
```
