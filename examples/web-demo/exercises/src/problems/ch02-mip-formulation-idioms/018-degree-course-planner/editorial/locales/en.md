## Approach

Declare binary decision variables $x_j$ (`take[j]`), enforce one linear capacity inequality per workload category using requirements $w_{k,j}$ (`requirements[k][j]`) and caps $C_k$ (`caps[k]`), add prerequisite inequalities for pairs in $\mathcal{P}$ (`prerequisites`) and time-conflict inequalities for pairs in $\mathcal{T}$ (`timeConflicts`), and maximize total interest weighted by $v_j$ (`interest[j]`).

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_{\text{course}} \le x_{\text{prereq}} && \forall (\text{prereq}, \text{course}) \in \mathcal{P} \\
& x_a + x_b \le 1 && \forall (a, b) \in \mathcal{T} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## Key Points

- **Multidimensional coupling defeats single-ratio heuristics**: With two or more workload caps, a course that looks light in category 0 can exhaust category 1; only solving all dimensions jointly yields the true optimum.
- **Combining logical edges with knapsack packing**: Prerequisite edges ($x_{\text{course}} \le x_{\text{prereq}}$) force paying the combined workload of a course and its prerequisites, while time-conflict pairs ($x_a + x_b \le 1$) prevent enrolling in overlapping courses together.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

In addition to the capacity constraint for each workload category `k`, add the implication inequalities for prerequisite pairs `[prereq, course]` and mutual-exclusion inequalities for time-conflict pairs `[a, b]` over the `take` variables.

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
