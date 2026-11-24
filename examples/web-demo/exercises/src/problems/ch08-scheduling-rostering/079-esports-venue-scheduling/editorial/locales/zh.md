## 解题思路

引入二元比赛指派变量 $x_{m,v,s} \in \{0, 1\}$（不兼容场馆强制置零）以及有界连续加时变量 $o_{v,s} \in [0, O_{\max}]$。每场比赛最多安排一次，各场馆时段块的总直播时长不超过 $B + o_{v,s}$，最大化总收视得分减去加时惩罚成本。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{m=0}^{M-1} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} p_m x_{m,v,s} - c_{\text{ot}} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} o_{v,s} \\
\text{s.t.} \quad & \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} x_{m,v,s} \le 1 && \forall m \\
& \sum_{s=0}^{S-1} x_{m,v,s} = 0 && \forall m, v : \text{compat}_{m,v} = 0 \\
& \sum_{m=0}^{M-1} d_m x_{m,v,s} \le B + o_{v,s} && \forall v, s \\
& 0 \le o_{v,s} \le O_{\max} && \forall v, s \\
& x_{m,v,s} \in \{0, 1\} && \forall m, v, s
\end{aligned}
$$

## 核心要点

- **可选排程（`<= 1`）将加时转化为成本收益权衡**：由于无需安排全部比赛，只有当收视增益 $p_m$ 高于加时惩罚 $c_{\text{ot}} \cdot \Delta o$ 时才值得动用加时（示例中加时单价为 25，得分 18 的比赛 4 因此被放弃）。
- **连续松弛变量 $o_{v,s}$ 刻画弹性时长**：用 $B + o_{v,s}$（$0 \le o_{v,s} \le O_{\max}$）替代硬容量 $B$，无需额外二元变量即可实现分段线性惩罚。
- **场馆兼容掩码约束舞台/设备限制**：将不兼容的 `(m, v)` 指派固定为零可缩小分支定界搜索空间并满足场馆设施要求。
- 相关定义：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 关键实现

除了每场比赛至多安排一次及场馆兼容性约束外，还需将每个场馆时段块的总直播时长限制在常规时长与加时时长之和以内。在 WaSHI 中使用 `forEach` 和 `flatMap` 构建约束数组，在 PuLP 中则通过循环与 `pulp.lpSum` 实现。

**WaSHI (TypeScript)**

```ts
x.forEach((matchVenues, m) => {
  model.constraint(expr`${sum(matchVenues.flat())} <= 1`);
  matchVenues.forEach((venueSlots, v) => {
    if (input.compatible[m][v] === 0) model.constraint(expr`${sum(venueSlots)} == 0`);
  });
});
model.constraint(
  overtime.flatMap((venueSlots, v) =>
    venueSlots.map((ot, s) => {
      const load = sum(
        x.map((matchVenues, mIdx) => expr`${input.durations[mIdx]} * ${matchVenues[v][s]}`)
      );
      return expr`${load} <= ${input.regularLength} + ${ot}`;
    })
  )
);
```

**PuLP (Python)**

```python
for m in range(num_matches):
    prob += pulp.lpSum(x[m][v][s] for v in range(num_venues) for s in range(num_slots)) <= 1
    for v in range(num_venues):
        if compatible[m][v] == 0:
            prob += pulp.lpSum(x[m][v]) == 0
for v in range(num_venues):
    for s in range(num_slots):
        prob += pulp.lpSum(durations[m] * x[m][v][s] for m in range(num_matches)) <= reg_len + overtime[v][s]
```
