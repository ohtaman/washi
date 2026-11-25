## 解题思路

声明二进制决策变量 $x_j$（`take[j]`），按工作量 $w_{k,j}$（`requirements[k][j]`）与上限 $C_k$（`caps[k]`）为每个类别添加线性容量约束，针对先修课程对集合 $\mathcal{P}$（`prerequisites`）和时间冲突对集合 $\mathcal{T}$（`timeConflicts`）加入逻辑不等式，并最大化按兴趣分值 $v_j$（`interest[j]`）加权的总分。

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

## 核心要点

- **多维耦合使单一性价比贪心失效**：当存在两个或以上工作量上限时，在类别 0 上看似轻松的课程可能耗尽类别 1 的容量；只有联合求解所有类别才能得到真正的最优解。
- **逻辑依赖与背包打包的结合**：先修边（$x_{\text{course}} \le x_{\text{prereq}}$）强制计入课程及其先修课程的组合工作量，而时间冲突对（$x_a + x_b \le 1$）防止同时选修时间重叠的课程。
- 相关概念：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) 和 [模型基本要素](?view=guide&lang=zh#building-blocks)。

## 实现要点

在各工作量类别 `k` 的容量约束之外，在 `take` 变量上设置先修课程对 `[prereq, course]` 的蕴含不等式以及时间冲突对 `[a, b]` 的互斥不等式。

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
