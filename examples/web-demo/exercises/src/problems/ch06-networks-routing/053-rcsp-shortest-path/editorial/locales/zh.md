## 解题思路

为每条有向边设置二进制决策变量 `x[e]`，在各节点施加单位 s-t 流量守恒，再加入背包型的累计资源上限约束 $\sum_e r_e x_e \le R$，并最小化路径总费用 $\sum_e c_e x_e$。

## 数学模型

$$
\begin{aligned}
\min_{x \in \{0,1\}^{|E|}} \quad & \sum_{e \in E} c_e x_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} x_e - \sum_{e=(u, v)} x_e = \begin{cases} 1 & v = s \\ -1 & v = t \\ 0 & \text{otherwise} \end{cases} && \forall v \in V \\
& \sum_{e \in E} r_e x_e \le R
\end{aligned}
$$

## 核心要点

- **为何必须使用 0-1 变量（MIP）**：普通最短路问题满足全幺模性，连续 LP 即可自动得到整数路径；但一旦加入哪怕一条资源上限旁约束，全幺模性就会被破坏，LP 松弛解会在“便宜但耗资源”和“昂贵但省资源”两条路径之间分流，因此必须使用 0-1 整数变量。
- **自动无环性**：在所有边费用严格为正（$c_e > 0$）时，费用最小化目标会自动避免出现与主路径分离的多余环路。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (let v = 0; v < input.nodeCount; v++) {
  const rhs = v === input.source ? 1 : v === input.sink ? -1 : 0;
  const outVars = x.filter((_, i) => input.edges[i].from === v);
  const inVars = x.filter((_, i) => input.edges[i].to === v);
  m.constraint(expr`${sum(outVars)} - ${sum(inVars)} == ${rhs}`);
}
m.constraint(
  expr`${sum(x.map((v, i) => expr`${input.edges[i].resource} * ${v}`))} <= ${input.maxResource}`
);
```

**PuLP (Python)**

```python
for v in range(n):
    rhs = 1 if v == s else (-1 if v == t else 0)
    out_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["from"] == v)
    in_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_x - in_x == rhs
prob += pulp.lpSum(e["resource"] * x[i] for i, e in enumerate(edges)) <= max_r
```
