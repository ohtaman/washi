## 解题思路

声明二进制决策变量 `take[j]`，为每个工作量类别 `caps[k]` 添加一条线性容量不等式，加入先修约束 `take[course] <= take[prereq]` 和时间冲突约束 `take[a] + take[b] <= 1`，并最大化总兴趣分值。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_{\text{course}} \le x_{\text{prereq}} && \forall (\text{prereq}, \text{course}) \in \mathcal{P} \\
& x_a + x_b \le 1 && \forall (a, b) \in \mathcal{T} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## 关键要点

- **多维耦合使单一性价比贪心失效**: 当存在两个或以上工作量上限时，在维度 0 上看似轻松的课程可能耗尽维度 1 的容量；只有联合求解所有维度才能得到真正的最优解。
- **逻辑依赖与背包打包的结合**: 先修边（$x_{\text{course}} \le x_{\text{prereq}}$）强制计入课程及其先修课程的组合工作量，而时间冲突对（$x_a + x_b \le 1$）防止同时选修时间重叠的课程。
- 相关概念：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) 和 [核心构建模块](?view=guide&lang=zh#building-blocks)。

## 核心实现

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.caps.map((cap, k) => expr`dot(${input.requirements[k]}, ${take}) <= ${cap}`)
);
m.constraint(
  input.prerequisites.map(([prereq, course]) => expr`${take[course]} <= ${take[prereq]}`)
);
m.constraint(
  input.timeConflicts.map(([a, b]) => expr`${take[a]} + ${take[b]} <= 1`)
);
```

**PuLP (Python)**

```python
for k, cap in enumerate(caps):
    prob += pulp.lpDot(requirements[k], take) <= cap
for prereq, course in prerequisites:
    prob += take[course] <= take[prereq]
for a, b in time_conflicts:
    prob += take[a] + take[b] <= 1
```
