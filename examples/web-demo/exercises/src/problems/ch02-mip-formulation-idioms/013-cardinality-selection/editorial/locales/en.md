## Approach

Declare binary variables `selected[i]`, enforce the budget inequality, express every cardinality rule (`mutexGroups`, `exactGroups`, and `atLeastOneGroups`) as a linear sum over the group's indices, and maximize total value.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& \sum_{i \in G} x_i \le 1 && \forall G \in \mathcal{G}_{\text{mutex}} \\
& \sum_{i \in G} x_i = k_G && \forall (G, k_G) \in \mathcal{G}_{\text{exact}} \\
& \sum_{i \in G} x_i \ge 1 && \forall G \in \mathcal{G}_{\ge 1} \\
& x_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## Key Points

- **Summing binary variables counts selected items**: Because each $x_i \in \{0, 1\}$, $\sum_{i \in G} x_i$ equals the exact cardinality $|S \cap G|$ of chosen items in subset $G$, letting `<= 1`, `== k`, and `>= 1` cover mutual exclusion, exact quota, and mandatory coverage uniformly.
- **Overlapping groups work seamlessly**: A single project index may appear in multiple rules at once without extra variables, letting the solver satisfy coupled quota interactions globally.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

In addition to the budget constraint, iterate over each of the three group arrays and add `<= 1`, `== count`, and `>= 1` constraints on the sum of the corresponding binary variables `selected[i]`.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(
  input.mutexGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} <= 1`)
);
m.constraint(
  input.exactGroups.map(
    (g) => expr`${sum(g.indices.map((i) => selected[i]))} == ${g.count}`
  )
);
m.constraint(
  input.atLeastOneGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} >= 1`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(costs, selected) <= budget
for group in mutex_groups:
    prob += pulp.lpSum(selected[i] for i in group) <= 1
for rule in exact_groups:
    prob += pulp.lpSum(selected[i] for i in rule["indices"]) == rule["count"]
for group in at_least_one_groups:
    prob += pulp.lpSum(selected[i] for i in group) >= 1
```
