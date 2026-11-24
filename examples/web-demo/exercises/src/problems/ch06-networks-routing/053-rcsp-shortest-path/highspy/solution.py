import pulp


def solve(node_count, source, sink, max_resource, edges) -> dict:
    """Return {"selected": list[int], "total_cost": float}."""
    n = node_count
    s = source
    t = sink
    max_r = max_resource

    prob = pulp.LpProblem("rcsp_shortest_path", pulp.LpMinimize)
    # x[i] in {0, 1}: binary indicator for including edge i in the s-t path
    x = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(len(edges))]

    # Unit s-t flow conservation: +1 net outflow at source, -1 at sink, 0 elsewhere
    for v in range(n):
        rhs = 1 if v == s else (-1 if v == t else 0)
        out_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["from"] == v)
        in_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["to"] == v)
        prob += out_x - in_x == rhs

    # Side constraint: total resource consumption along the path cannot exceed max_r
    prob += pulp.lpSum(e["resource"] * x[i] for i, e in enumerate(edges)) <= max_r
    # Minimize total path cost
    prob += pulp.lpSum(e["cost"] * x[i] for i, e in enumerate(edges))
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to clean integers
    return {
        "selected": [round(pulp.value(v)) for v in x],
        "total_cost": float(pulp.value(prob.objective)),
    }
