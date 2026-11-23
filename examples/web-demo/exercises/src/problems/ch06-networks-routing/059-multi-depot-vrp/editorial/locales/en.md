## Approach

Define depot-tagged binary arc variables $x_{ijd}$ restricted to $V_d = \{d\} \cup C$ so every vehicle leaving depot $d$ can only traverse customers and return to the same depot $d$. Enforce overall customer visit uniqueness, per-depot flow conservation, fleet caps, depot supply caps, and shared load-tracking MTZ constraints $u_i - u_j + Q \sum_d x_{ijd} \le Q - \text{demands}[j]$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{d \in D} \sum_{i \ne j \in V_d} \text{dist}_{ij} x_{ijd} \\
\text{s.t.} \quad & \sum_{d \in D} \sum_{j \in V_d \setminus \{i\}} x_{ijd} = 1 && \forall i \in C \\
& \sum_{j \in V_d \setminus \{i\}} x_{jid} = \sum_{j \in V_d \setminus \{i\}} x_{ijd} && \forall d \in D, i \in C \\
& \sum_{j \in C} x_{djd} = \sum_{i \in C} x_{idd} \le K_d, \quad \sum_{i \in C} \text{demands}[i] \sum_{j \in V_d \setminus \{i\}} x_{ijd} \le C_d && \forall d \in D \\
& u_i - u_j + Q \sum_{d \in D} x_{ijd} \le Q - \text{demands}[j] && \forall i \ne j \in C
\end{aligned}
$$

## Key Points

- **Preventing inter-depot paths by design**: Restricting each depot $d$'s variables to $V_d = \{d\} \cup C$ makes any cross-depot path ($d_1 \to \dots \to d_2$) structurally impossible without needing extra Big-M depot-matching constraints.
- **Shared load potentials across depots**: Because each customer $i \in C$ is visited once across all depots, a single vector $u_i \in [\text{demands}[i], Q]$ enforces both vehicle capacity and subtour elimination across every depot simultaneously.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Enumerate distinct customer pairs `(ci, cj)` with `flatMap`, and use the sum of arc variables across all depots `yij` to register the MTZ constraints over the shared load potentials `u`.

**WaSHI (TypeScript)**

```ts
m.constraint(
  customers.flatMap((ci, idxI) =>
    customers.flatMap((cj, idxJ) => {
      if (idxI === idxJ) return [];
      const yij = sum(x.map((xd) => xd.get(`${ci}_${cj}`)!));
      return [expr`${u[idxI]} - ${u[idxJ]} + ${Q} * ${yij} <= ${Q - input.demands[cj]}`];
    })
  )
);
```

**PuLP (Python)**

```python
for i in range(num_depots, n):
    for j in range(num_depots, n):
        if i != j:
            y_ij = pulp.lpSum(x[(i, j, d)] for d in range(num_depots))
            prob += u[i] - u[j] + q_cap * y_ij <= q_cap - demands[j]
```
