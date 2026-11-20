## Approach

Declare binary decision variables `selected[j]`, enforce one linear resource inequality per dimension `capacities[k]`, add prerequisite inequalities `selected[a] <= selected[b]` and incompatibility inequalities `selected[c] + selected[d] <= 1`, and maximize total value.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_a \le x_b && \forall (a, b) \in \mathcal{P} \\
& x_c + x_d \le 1 && \forall (c, d) \in \mathcal{I} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## Key Points

- **Multidimensional coupling defeats single-ratio heuristics**: With two or more knapsack constraints, an item that looks cheap per unit of resource 0 can exhaust resource 1; only solving all dimensions jointly yields the true optimum.
- **Combining logical edges with knapsack packing**: Prerequisite edges ($x_a \le x_b$) force paying the combined weight of an item and its dependencies, while incompatibility pairs ($x_c + x_d \le 1$) prevent picking high-value conflicting pairs together.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.weights[k]}, ${selected}) <= ${cap}`)
);
m.constraint(
  input.prerequisites.map(([a, b]) => expr`${selected[a]} <= ${selected[b]}`)
);
m.constraint(
  input.incompatibles.map(([c, d]) => expr`${selected[c]} + ${selected[d]} <= 1`)
);
```

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(weights[k], selected) <= cap
for a, b in prerequisites:
    prob += selected[a] <= selected[b]
for c, d in incompatibles:
    prob += selected[c] + selected[d] <= 1
```
