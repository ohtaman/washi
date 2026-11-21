import pulp


def solve(supplies, edges) -> dict:
    """Return {"flows": list[float], "totalCost": float}."""
    n = len(supplies)

    prob = pulp.LpProblem("min_cost_flow_tu", pulp.LpMinimize)
    flows = [
        pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
        for i, e in enumerate(edges)
    ]

    for v in range(n):
        out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
        in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
        prob += out_flow - in_flow == supplies[v]

    prob += pulp.lpSum(e["cost"] * flows[i] for i, e in enumerate(edges))
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "flows": [float(pulp.value(v)) or 0.0 for v in flows],
        "totalCost": float(pulp.value(prob.objective)),
    }
