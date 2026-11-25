## Approach

Define depot-tagged binary arc variables $x_{ijd}$ restricted to $V_d = \{d\} \cup \mathcal{C}$ so every vehicle leaving depot $d \in \mathcal{D}$ can only traverse customers and return to the same depot $d$. Enforce overall customer visit uniqueness, per-depot flow conservation, fleet caps, depot supply caps, and shared load-tracking MTZ constraints $u_i - u_j + Q \sum_d x_{ijd} \le Q - q_j$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{d \in \mathcal{D}} \sum_{i \ne j \in V_d} \text{dist}_{ij} x_{ijd} \\
\text{s.t.} \quad & \sum_{d \in \mathcal{D}} \sum_{j \in V_d \setminus \{i\}} x_{ijd} = 1 && \forall i \in \mathcal{C} \\
& \sum_{j \in V_d \setminus \{i\}} x_{jid} = \sum_{j \in V_d \setminus \{i\}} x_{ijd} && \forall d \in \mathcal{D},\; i \in \mathcal{C} \\
& \sum_{j \in \mathcal{C}} x_{djd} = \sum_{i \in \mathcal{C}} x_{idd} \le K_d, \quad \sum_{i \in \mathcal{C}} q_i \sum_{j \in V_d \setminus \{i\}} x_{ijd} \le S_d && \forall d \in \mathcal{D} \\
& u_i - u_j + Q \sum_{d \in \mathcal{D}} x_{ijd} \le Q - q_j && \forall i \ne j \in \mathcal{C} \\
& q_i \le u_i \le Q && \forall i \in \mathcal{C} \\
& x_{ijd} \in \{0, 1\} && \forall d \in \mathcal{D},\; i \ne j \in V_d
\end{aligned}
$$

where $\mathcal{D} = \{0, \dots, D-1\}$, $\mathcal{C} = \{D, \dots, D+C-1\}$, $V_d = \{d\} \cup \mathcal{C}$, $q_i = \text{demands}[i]$, $K_d = \text{depotMaxVehicles}[d]$, $S_d = \text{depotCapacities}[d]$, and $Q = \text{vehicleCapacity}$.

## Key Points

- **Preventing inter-depot paths by design**: Restricting each depot $d$'s variables to $V_d = \{d\} \cup \mathcal{C}$ makes any cross-depot path ($d_1 \to \dots \to d_2$) structurally impossible without needing extra Big-M depot-matching constraints.
- **Shared load potentials across depots**: Because each customer $i \in \mathcal{C}$ is visited once across all depots, a single vector $u_i \in [q_i, Q]$ enforces both vehicle capacity and subtour elimination across every depot simultaneously.
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
            prob += u[i] - u[j] + vehicle_capacity * y_ij <= vehicle_capacity - demands[j]
```
