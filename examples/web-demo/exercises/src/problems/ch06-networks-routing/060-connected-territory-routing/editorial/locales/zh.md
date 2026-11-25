## 解题思路

将小区归属 0-1 变量 $y_{ik}$、枢纽选址 $h_{ik} \le y_{ik}$ 与邻接图 `adjEdges` 上的单商品流（$s_{ik} \le n h_{ik}$，$f_{ek} \le (n-1)y_{uk}$，$f_{ek} \le (n-1)y_{vk}$）结合，保证每个辖区内部与所选枢纽连通；再叠加同辖区约束 $y_{ik} - y_{jk} \le 1 - x_{ij}$ 及锚定枢纽的 MTZ 巡回约束，协同求得最小总成本方案。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1}\sum_{i=0}^{n-1} F_i h_{ik} + \sum_{i=0}^{n-1}\sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_k y_{ik} = 1 \;\; (\forall i), \quad \sum_i h_{ik} = 1, \quad h_{ik} \le y_{ik}, \quad L \le \sum_i \text{demands}_i y_{ik} \le U && \forall k \\
& s_{ik} \le n h_{ik} \;\; (\forall i, k), \quad f_{u \to v, k} \le (n-1) y_{uk}, \quad f_{u \to v, k} \le (n-1) y_{vk} && \forall (u, v) \in \vec{E},\; k \\
& s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik} && \forall i, k \\
& \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 \;\; (\forall i), \quad y_{ik} - y_{jk} \le 1 - x_{ij} && \forall i \ne j,\; k \\
& u_i + 1 - u_j \le n\left(1 - x_{ij} + \sum_k h_{jk}\right) && \forall i \ne j \\
& y_{ik}, h_{ik}, x_{ij} \in \{0, 1\}, \quad s_{ik} \ge 0, \quad f_{u \to v, k} \ge 0, \quad 0 \le u_i \le n - 1
\end{aligned}
$$

其中 $F_i = \text{hubCosts}[i]$，$d_{ij} = \text{dist}[i][j]$，$[L, U] = \text{demandBounds}$，$K = \text{numTerritories}$，$\vec{E}$ 包含每条无向边 $\{u, v\} \in \text{adjEdges}$ 对应的双向有向弧 $(u, v)$ 与 $(v, u)$。

## 核心要点

- **对未知枢纽流量的无乘积线性化**：不直接写双线性乘积 $\left(\sum_j y_{jk}\right) h_{ik}$，而是引入连续供给变量 $s_{ik} \le n h_{ik}$ 并配合流量守恒 $s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik}$，全图求和自动迫使唯一枢纽发出辖区节点总数大小的流。
- **枢纽处自动复位的 MTZ 约束**：只在回到任一枢纽（$\sum_k h_{jk} = 1$）时放松 MTZ 位势步进，既能关闭辖区大环，又杜绝非枢纽节点构成子环；同区限制保证环路不会跨越辖区边界。
- **破除辖区编号对称性**：添加 $\sum_i i \cdot h_{ik} + 1 \le \sum_i i \cdot h_{i,k+1}$ 按枢纽编号排序，可大幅剪除等价分支。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

对所有小区 `nodes` 施加出度与入度为 1 的约束，同时使用 `filter` 和 `flatMap` 枚举不同小区对 `(i, j)`，统一注册同辖区限制与基于枢纽的 MTZ 约束。

**WaSHI (TypeScript)**

```ts
const nodes = Array.from({ length: n }, (_, i) => i);
const territories = Array.from({ length: K }, (_, k) => k);

nodes.forEach((i) => {
  m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
  m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  m.constraint(
    nodes
      .filter((j) => i !== j)
      .flatMap((j) => [
        ...territories.map((k) => expr`${y[i][k]} - ${y[j][k]} <= 1 - ${x[i][j]!}`),
        expr`${u[i]} + 1 - ${u[j]} <= ${n} * (1 - ${x[i][j]!} + ${sum(h[j])})`,
      ])
  );
});
```

**PuLP (Python)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
    prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1
    for j in range(n):
        if i != j:
            for k in range(num_territories):
                prob += y[i][k] - y[j][k] <= 1 - x[i][j]
            h_j = pulp.lpSum(h[j][k] for k in range(num_territories))
            prob += u[i] + 1 - u[j] <= n * (1 - x[i][j] + h_j)
```
