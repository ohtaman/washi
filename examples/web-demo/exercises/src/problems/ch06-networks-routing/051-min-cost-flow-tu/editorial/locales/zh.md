## 解题思路

为每条有向边建立非负连续流量变量 `flows[e]`（上界为 `edges[e].cap`），对每个节点施加“总流出减总流入等于净供给”的流量守恒约束，并最小化线性运输总费用。

## 数学模型

$$
\begin{aligned}
\min_{f} \quad & \sum_{e \in E} c_e f_e \\
\text{s.t.} \quad & \sum_{e=(v, w) \in E} f_e - \sum_{e=(u, v) \in E} f_e = b_v && \forall v \in V \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## 核心要点

- **全幺模性（TU）与自动整数性**：有向图的节点-边关联矩阵每列恰好包含一个 $+1$ 和一个 $-1$，任意方子阵的行列式均为 $0, +1$ 或 $-1$。只要供需 $b_v$ 与容量 $u_e$ 为整数，纯连续 LP 的每个极点（基本可行解）天然全为整数，无需引入整数变量或分支定界。
- **直接输出连续变量值**：无需使用 `Math.round()`，单纯形法求得的连续变量值天然就是精确整数。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

为每条边分配连续变量 `flows[e]`，并通过 `input.supplies.map` 统一注册各节点净流出（流出和减去流入和）等于 `supply` 的流量守恒约束。

**WaSHI (TypeScript)**

```ts
const flows = input.edges.map((e, i) =>
  m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
);
m.constraint(
  input.supplies.map((supply, v) => {
    const outFlows = flows.filter((_, i) => input.edges[i].from === v);
    const inFlows = flows.filter((_, i) => input.edges[i].to === v);
    return expr`${sum(outFlows)} - ${sum(inFlows)} == ${supply}`;
  })
);
```

**PuLP (Python)**

```python
flows = [
    pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
    for i, e in enumerate(edges)
]
for v in range(n):
    out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
    in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_flow - in_flow == supplies[v]
```
