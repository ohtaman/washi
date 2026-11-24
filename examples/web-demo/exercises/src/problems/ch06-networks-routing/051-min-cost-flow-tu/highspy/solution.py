import pulp


def solve(supplies, edges) -> dict:
    """Return {"flows": list[float], "total_cost": float}."""
    n = len(supplies)

    prob = pulp.LpProblem("min_cost_flow_tu", pulp.LpMinimize)
    # flows[i]: continuous flow along edge i in [0, cap]; TU constraint matrix yields integral optima
    flows = [
        pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
        for i, e in enumerate(edges)
    ]

    # Flow conservation at each node: net outflow (out - in) equals node supply/demand
    for v in range(n):
        out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
        in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
        prob += out_flow - in_flow == supplies[v]

    # Minimize total edge flow cost
    prob += pulp.lpSum(e["cost"] * flows[i] for i, e in enumerate(edges))
    prob.solve(pulp.HiGHS(msg=False))

    # Normalize -0.0 to 0.0
    return {
        "flows": [float(pulp.value(v)) or 0.0 for v in flows],
        "total_cost": float(pulp.value(prob.objective)),
    }
