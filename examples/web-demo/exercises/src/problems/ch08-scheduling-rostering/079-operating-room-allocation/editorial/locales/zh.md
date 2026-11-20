## 解题思路

建立二进制变量 $x_{c,r,s} \in \{0, 1\}$ 表示病例 $c$ 是否安排在手术室 $r$ 的时段 $s$（不兼容手术室强制为零），并为每个手术室-时段区块设置连续有界加班变量 $o_{r,s} \in [0, O_{\max}]$。约束每例手术至多排程一次、区块负荷不超过 $B + o_{r,s}$，最大化总优先级收益减去总加班惩罚。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} p_c x_{c,r,s} - c_{\text{ot}} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} o_{r,s} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} x_{c,r,s} \le 1 && \forall c \\
& \sum_{s=0}^{S-1} x_{c,r,s} = 0 && \forall c, r : \text{compat}_{c,r} = 0 \\
& \sum_{c=0}^{C-1} d_c x_{c,r,s} \le B + o_{r,s} && \forall r, s \\
& 0 \le o_{r,s} \le O_{\max} && \forall r, s \\
& x_{c,r,s} \in \{0, 1\} && \forall c, r, s
\end{aligned}
$$

## 核心要点

- **可选排程（`<= 1`）实现收益-加班权衡**：由于不必强制接纳全部病例，只有当病例优先级 $p_c$ 高于由此触发的加班边际成本 $c_{\text{ot}} \cdot \Delta o$ 时才值得动用加班——示例中病例 4 因 $20 < 25$ 而被延后。
- **连续松弛变量 $o_{r,s}$ 刻画弹性产能**：将硬上限改为 $B + o_{r,s}$（$0 \le o_{r,s} \le O_{\max}$）无需额外二进制变量即可精准表达分段线性加班成本。
- **手术室兼容掩码剪枝**：对不兼容的 `(c, r)` 直接归零可有效缩减分支定界规模。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
x.forEach((caseRooms, c) => {
  m.constraint(expr`${sum(caseRooms.flat())} <= 1`);
  caseRooms.forEach((roomSessions, r) => {
    if (input.compatible[c][r] === 0) m.constraint(expr`${sum(roomSessions)} == 0`);
  });
});
for (let r = 0; r < R; r++) {
  for (let s = 0; s < S; s++) {
    const load = sum(x.map((caseRooms, c) => expr`${input.durations[c]} * ${caseRooms[r][s]}`));
    m.constraint(expr`${load} <= ${input.regularCapacity} + ${overtime[r][s]}`);
  }
}
```

**PuLP (Python)**

```python
for c in range(num_cases):
    prob += pulp.lpSum(x[c][r][s] for r in range(num_rooms) for s in range(num_sessions)) <= 1
    for r in range(num_rooms):
        if compatible[c][r] == 0:
            prob += pulp.lpSum(x[c][r]) == 0
for r in range(num_rooms):
    for s in range(num_sessions):
        prob += pulp.lpSum(durations[c] * x[c][r][s] for c in range(num_cases)) <= reg_cap + overtime[r][s]
```
