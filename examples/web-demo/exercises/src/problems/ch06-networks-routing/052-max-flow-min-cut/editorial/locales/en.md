## Approach

Solve the primal max-flow LP (`0 <= f_e <= cap_e`, conservation at intermediate nodes, maximize net flow leaving `source`), then run BFS/DFS from `source` in the residual graph to partition vertices into reachable $S$ and unreachable $V \setminus S$; edges crossing from $S$ to $V \setminus S$ form an exact minimum s-t cut.

## Mathematical Model

$$
\begin{aligned}
\max_{f} \quad & \sum_{e=(s, w)} f_e - \sum_{e=(u, s)} f_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} f_e - \sum_{e=(u, v)} f_e = 0 && \forall v \in V \setminus \{s, t\} \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## Key Points

- **Residual reachability guarantees an exact cut**: An arc $e = (u, v)$ belongs to the residual graph if $f_e < u_e$ (forward) or if its reverse arc $(v, u)$ has $f_e > 0$ (backward cancellation). Because the LP optimal flow admits no augmenting s-t path, the reachable set $S$ satisfies $s \in S, t \notin S$, every outgoing edge from $S$ is saturated ($f_e = u_e$), and every incoming edge to $S$ carries zero flow ($f_e = 0$).
- **Avoid solver-dependent dual signs**: Extracting the cut directly from residual reachability works deterministically across any LP solver without relying on dual sign conventions or tie-breaking on degenerate dual vertices.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const visited = new Array(n).fill(false);
visited[input.source] = true;
const queue = [input.source];
while (queue.length > 0) {
  const u = queue.shift()!;
  for (let i = 0; i < input.edges.length; i++) {
    const e = input.edges[i];
    if (e.from === u && !visited[e.to] && flowVals[i] < e.cap - 1e-6) {
      visited[e.to] = true;
      queue.push(e.to);
    }
    if (e.to === u && !visited[e.from] && flowVals[i] > 1e-6) {
      visited[e.from] = true;
      queue.push(e.from);
    }
  }
}
```

**PuLP (Python)**

```python
visited = [False] * n
visited[s] = True
queue = [s]
while queue:
    u = queue.pop(0)
    for i, e in enumerate(edges):
        if e["from"] == u and not visited[e["to"]] and flow_vals[i] < e["cap"] - 1e-6:
            visited[e["to"]] = True
            queue.append(e["to"])
        if e["to"] == u and not visited[e["from"]] and flow_vals[i] > 1e-6:
            visited[e["from"]] = True
            queue.append(e["from"])
cut_edges = [i for i, e in enumerate(edges) if visited[e["from"]] and not visited[e["to"]]]
```
