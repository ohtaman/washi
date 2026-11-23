import pulp


def solve(node_count, source, sink, edges) -> dict:
    """Return {"flows": list[float], "cut_edges": list[int], "max_flow": float}."""
    n = node_count
    s = source
    t = sink

    prob = pulp.LpProblem("max_flow_min_cut", pulp.LpMaximize)
    flows = [
        pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
        for i, e in enumerate(edges)
    ]

    for v in range(n):
        if v in (s, t):
            continue
        out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
        in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
        prob += out_flow - in_flow == 0

    prob += pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == s) - pulp.lpSum(
        flows[i] for i, e in enumerate(edges) if e["to"] == s
    )
    prob.solve(pulp.HiGHS(msg=False))

    flow_vals = [float(pulp.value(v)) or 0.0 for v in flows]

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

    return {
        "flows": flow_vals,
        "cut_edges": cut_edges,
        "max_flow": float(pulp.value(prob.objective)),
    }
