## Approach

Declare binary decision variables $x_{c,r,t} \in \{0, 1\}$ assigning each course $c$ to a feasible room $r$ and timeslot $t$. Enforce single assignment per course, room capacity limits, room exclusivity per timeslot, and clique conflict constraints per teacher and student cohort, then maximize total slot preference score.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} w_{c,t} x_{c,r,t} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} x_{c,r,t} = 1 && \forall c \\
& x_{c,r,t} = 0 && \forall c, r, t : s_c > K_r \\
& \sum_{c=0}^{C-1} x_{c,r,t} \le 1 && \forall r, t \\
& \sum_{c \in G} \sum_{r=0}^{R-1} x_{c,r,t} \le 1 && \forall \text{teacher/cohort group } G, \; \forall t \\
& x_{c,r,t} \in \{0, 1\} && \forall c, r, t
\end{aligned}
$$

## Key Points

- **Clique constraints strengthen the LP relaxation**: Grouping all courses sharing teacher $p$ or cohort $g$ into one inequality $\sum_{c \in G} \sum_r x_{c,r,t} \le 1$ is strictly stronger in LP relaxation than writing pairwise constraints $x_{a,t} + x_{b,t} \le 1$, while enforcing the exact same integer feasibility.
- **Room compatibility filters out oversized enrollments upfront**: Setting $\sum_t x_{c,r,t} = 0$ whenever $s_c > K_r$ prevents small seminar rooms from ever hosting large lectures.
- **Coupling between room capacity and time conflicts**: Even when two courses have different teachers, sharing a cohort forces them into separate timeslots, which can spill a course out of its top-ranked slot or room.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Construct the at-most-one-course constraint per room and timeslot, and the per-timeslot clique constraints for each teacher and cohort group. In WaSHI, bundle each group's variables into constraint arrays with `flatMap` and `forEach`; in PuLP, express them with comprehensions.

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
