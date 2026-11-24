## Approach

Use one binary variable $x_{ij} \in \{0, 1\}$ per undirected edge ($0 \le i < j < n$) and require every city to have degree 2. Repeatedly solve the MIP, find connected cycles in the active graph, and add the DFJ inequality $\sum_{i,j \in S, i < j} x_{ij} \le |S| - 1$ for every subtour $S$ until a single tour spans all $n$ cities.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{0 \le i < j < n} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j < i} x_{ji} + \sum_{j > i} x_{ij} = 2 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{\substack{i, j \in S \\ i < j}} x_{ij} \le |S| - 1 && \forall \text{ separated subtour } S \subsetneq V \\
& x_{ij} \in \{0, 1\} && \forall 0 \le i < j < n
\end{aligned}
$$

## Key Points

- **Exponential constraints on demand**: There are $2^n - 2$ proper subsets $S$, yet clustered TSP instances typically need only a handful of DFJ cuts added lazily on violated integer solutions.
- **Multi-cut separation**: Adding a DFJ cut for *every* disconnected cycle found in an iteration rather than only one cycle cuts down re-solves dramatically. (In WaSHI, this separation pattern can also be orchestrated via `master.solveBenders` returning `kind: "feasibility"` cuts.)
- **Simple undirected edges rule out 2-cycles**: Because each undirected pair $\{i, j\}$ has a single binary variable, 2-cycles are structurally impossible; minimum subtour size is 3, which is why $n = 5$ converges on iteration 1 while $n \ge 6$ can split into disjoint cycles of size $\ge 3$.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Solver Status Glossary](?view=guide&lang=en#solver-status).

## Key Implementation

Keep the same `Model` instance across the `while` loop, calling `await m.solve()` and incrementally adding DFJ cuts via `m.constraint(...)` for each disconnected subtour `comp` until only a single cycle remains.

**WaSHI (TypeScript)**

```ts
while (true) {
  iterations++;
  await m.solve();
  const components = extractCycles(edges, n);
  if (components.length === 1) {
    finalTour = components[0];
    break;
  }
  components.forEach((comp, idx) => {
    const internalEdges = collectInternalEdges(comp, edges);
    m.constraint(expr`sum(${internalEdges}) <= ${comp.length - 1}`, `dfj_${iterations}_${idx}`);
  });
}
```

**PuLP (Python)**

```python
while True:
    iterations += 1
    prob.solve(pulp.HiGHS(msg=False))
    components = extract_cycles(edges, n)
    if len(components) == 1:
        final_tour = components[0]
        break
    for comp in components:
        prob += pulp.lpSum(edges[(min(a, b), max(a, b))] for i, a in enumerate(comp) for b in comp[i + 1:]) <= len(comp) - 1
```
