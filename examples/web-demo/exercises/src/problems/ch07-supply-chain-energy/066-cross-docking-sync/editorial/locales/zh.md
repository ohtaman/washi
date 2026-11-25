## 解题思路

引入进出站卡车泊位指派二元变量 $x_{i,r}, y_{j,s}$、车对转运指示变量 $z_{i,j}$、品类连续货流 $f_{i,j,k}$、按泊位对拆解的连续货流 $w_{i,j,r,s}$，以及出站卡车的发车时刻 $t_j$ 与延迟量 $T_j$。将车对总货流拆解为 $w_{i,j,r,s}$ 可在无二次乘积项的前提下线性化泊位指派与货流的三线性耦合，再结合泊位容量、供货上限与需求满足、基于 Big-M 的发车时间同步以及延迟约束，最小化总搬运成本与延迟罚金之和。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i,j,r,s} c_{r,s} w_{i,j,r,s} + \gamma_{\text{delay}} \sum_{j} T_j \\
\text{s.t.} \quad & \sum_{r} x_{i,r} = 1 && \forall i \\
& \sum_{i} x_{i,r} \le C^{\text{in}}_r && \forall r \\
& \sum_{s} y_{j,s} = 1 && \forall j \\
& \sum_{j} y_{j,s} \le C^{\text{out}}_s && \forall s \\
& \sum_{j} f_{i,j,k} \le A_{i,k} && \forall i, k \\
& \sum_{i} f_{i,j,k} = B_{j,k} && \forall j, k \\
& \sum_{r,s} w_{i,j,r,s} = \sum_{k} f_{i,j,k} \le M_{i,j} z_{i,j} && \forall i, j \\
& \sum_{s} w_{i,j,r,s} \le M_{i,j} x_{i,r} && \forall i, j, r \\
& \sum_{r} w_{i,j,r,s} \le M_{i,j} y_{j,s} && \forall i, j, s \\
& t_j \ge a_i + \tau_{r,s} - M_T (3 - x_{i,r} - y_{j,s} - z_{i,j}) && \forall i, j, r, s \\
& T_j \ge t_j - d_j && \forall j \\
& x_{i,r}, y_{j,s}, z_{i,j} \in \{0, 1\}, \quad f_{i,j,k}, w_{i,j,r,s}, t_j, T_j \ge 0
\end{aligned}
$$

其中 $A_{i,k} = \text{supplies}[i][k]$、$B_{j,k} = \text{demands}[j][k]$、$C^{\text{in}}_r = \text{inDoorCaps}[r]$、$C^{\text{out}}_s = \text{outDoorCaps}[s]$、$c_{r,s} = \text{handlingCosts}[r][s]$、$\tau_{r,s} = \text{transferTimes}[r][s]$、$a_i = \text{arrivalTimes}[i]$、$d_j = \text{dueTimes}[j]$、$\gamma_{\text{delay}} = \text{delayCost}$，且取 $M_{i,j} = \sum_k \min(A_{i,k}, B_{j,k})$、$M_T = \max_i a_i + \max_{r,s} \tau_{r,s}$。

## 核心要点

- **无需非线性项的泊位对费用线性化**：由于每辆车仅停靠唯一泊位（$\sum_r x_{i,r} = 1, \sum_s y_{j,s} = 1$），通过限制 $\sum_s w_{i,j,r,s} \le M_{i,j} x_{i,r}$ 与 $\sum_r w_{i,j,r,s} \le M_{i,j} y_{j,s}$，仅需连续变量 $w_{i,j,r,s}$ 即可精确锁定实际发生的 $(r,s)$ 路径费用。
- **紧致构造两类 Big-M 上界**：车对之间货流上限 $M_{i,j}$ 取各品类供需交集之和，时间大 $M_T$ 取最大到站与最大搬运时间之和，兼顾模型严谨性与松弛紧度。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

对每组卡车对，将转运总货流拆解为泊位对变量 $w_{i,j,r,s}$，并同时施加两侧泊位指派与时间同步的大 M 约束。在 WaSHI 中使用 `map` 和 `flatMap` 批量生成泊位对约束数组，在 PuLP 中则通过双重循环逐一添加 $(r, s)$ 约束。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);
m.constraint(
  w[i][j].map((row, r) => expr`${sum(row)} <= ${maxPairFlow} * ${x[i][r]}`)
);
m.constraint(
  input.outDoorCaps.map((_, s) =>
    expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`
  )
);
m.constraint(
  input.transferTimes.flatMap((row, r) =>
    row.map((tau, s) => {
      const rhs = input.arrivalTimes[i] + tau - 3 * bigMT;
      return expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`;
    })
  )
);
```

**PuLP (Python)**

```python
prob += pair_flow <= m_ij * z[i][j]
prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
for r in range(R):
    prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
for s in range(S):
    prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
for r in range(R):
    for s in range(S):
        prob += dep[j] >= arrival_times[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])
```
