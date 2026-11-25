## Approach

Use binary routing arcs $x_{ij}$ ($i \ne j$, with travel distance $c_{ij}$ for `dist[i][j]`) enforcing in-degree and out-degree equal to 1 at every customer and at most $K$ (`maxVehicles`) departures and returns at depot 0. Pair them with continuous cumulative load variables $u_i \in [d_i, Q]$ (for customer demand $d_i$ and vehicle capacity $Q$) subject to $u_i - u_j + Q x_{ij} \le Q - d_j$, enforcing vehicle capacity and eliminating subtours simultaneously.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n-1\} \\
& \sum_{j=1}^{n-1} x_{0j} = \sum_{i=1}^{n-1} x_{i0} \le K \\
& u_i - u_j + Q x_{ij} \le Q - d_j && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad d_i \le u_i \le Q
\end{aligned}
$$

## Key Points

- **Cumulative load does double duty**: Replacing the unit step $+1$ in TSP's MTZ constraint with $d_j$ simultaneously bounds total demand along every depot-rooted route by $Q$ AND forbids any disconnected customer subtour (because positive demands cannot decrease around a cycle).
- **Tight Big-M without slack**: Since $u_i \le Q$ and $u_j \ge d_j$, when $x_{ij} = 0$ the difference $u_i - u_j$ can never exceed $Q - d_j$, making $Q$ the tightest valid multiplier.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Use `flatMap` and `filter` over the customer index array `customers` to enumerate distinct customer pairs and register the capacity-based MTZ constraints in one batch, enforcing both vehicle load limits and subtour elimination simultaneously.

**WaSHI (TypeScript)**

```ts
const customers = Array.from({ length: n - 1 }, (_, k) => k + 1);
m.constraint(
  customers.flatMap((i) =>
    customers
      .filter((j) => i !== j)
      .map((j) => expr`${u[i]!} - ${u[j]!} + ${Q} * ${x[i][j]!} <= ${Q - input.demands[j]}`)
  )
);
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + capacity * x[i][j] <= capacity - demands[j]
```
