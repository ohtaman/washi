## 解题思路

建立三维二进制指派变量 $x_{c,r,t} \in \{0, 1\}$ 表示课程 $c$ 是否安排在教室 $r$ 的时间片 $t$。依次施加每门课唯一排课、教室容量匹配、同室同时段互斥以及教师和学生群组的团冲突约束，最大化偏好总分。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} w_{c,t} x_{c,r,t} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} x_{c,r,t} = 1 && \forall c \\
& x_{c,r,t} = 0 && \forall c, r, t : s_c > K_r \\
& \sum_{c=0}^{C-1} x_{c,r,t} \le 1 && \forall r, t \\
& \sum_{c \in G} \sum_{r=0}^{R-1} x_{c,r,t} \le 1 && \forall \text{教师或群组集合 } G, \; \forall t \\
& x_{c,r,t} \in \{0, 1\} && \forall c, r, t
\end{aligned}
$$

## 核心要点

- **团约束强化线性松弛**：将共享同一教师或同一学生群组的所有课程集合 $G$ 写为单条团不等式 $\sum_{c \in G} \sum_r x_{c,r,t} \le 1$，在保持整数可行域等价的同时提供比两两互斥约束更紧的 LP 松弛上界。
- **预先剔除超容教室**：当选课人数 $s_c > K_r$ 时直接将对应教室变量固定为零，避免容量违规。
- **空间与时间冲突联动**：即使授课教师不同，共享学生群组也会迫使课程错峰排布，从而在紧缺大教室与高分时间片之间产生竞争权衡。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

构建各教室与时段的至多一门课约束，以及同一教师、同一群组在各时段的团冲突约束。在 WaSHI 中使用 `flatMap` 和 `forEach` 聚合各组变量并生成约束数组，在 PuLP 中则通过列表推导式实现。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.roomCapacities.flatMap((_, r) =>
    Array.from({ length: T }, (__, t) =>
      expr`${sum(x.map((courseRooms) => courseRooms[r][t]))} <= 1`
    )
  )
);
[...teacherGroups.values(), ...cohortGroups.values()]
  .filter((group) => group.length >= 2)
  .forEach((group) => {
    m.constraint(
      Array.from({ length: T }, (_, t) => {
        const vars = group.flatMap((c) => x[c].map((roomSlots) => roomSlots[t]));
        return expr`${sum(vars)} <= 1`;
      })
    );
  });
```

**PuLP (Python)**

```python
for r in range(num_rooms):
    for t in range(num_slots):
        prob += pulp.lpSum(x[c][r][t] for c in range(num_courses)) <= 1
for group in list(teacher_groups.values()) + list(cohort_groups.values()):
    if len(group) >= 2:
        for t in range(num_slots):
            prob += pulp.lpSum(x[c][r][t] for c in group for r in range(num_rooms)) <= 1
```
