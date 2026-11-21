import pulp


def solve(num_tasks, costs, routes) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    m_count = len(costs)

    prob = pulp.LpProblem("set_partitioning", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"route_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    for i in range(num_tasks):
        prob += pulp.lpSum(selected[j] for j in range(m_count) if i in routes[j]) == 1

    prob += pulp.lpDot(costs, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "totalCost": float(pulp.value(prob.objective)),
    }
