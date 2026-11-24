import pulp


def solve(num_tasks, costs, routes) -> dict:
    """Return {"selected": list[int], "total_cost": float}."""
    m_count = len(costs)

    prob = pulp.LpProblem("set_partitioning", pulp.LpMinimize)
    # Decision variables: binary selected[j] = 1 if route j is chosen.
    selected = [pulp.LpVariable(f"route_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    # Partitioning constraint: every task i must be covered by exactly one selected route.
    for i in range(num_tasks):
        prob += pulp.lpSum(selected[j] for j in range(m_count) if i in routes[j]) == 1

    # Objective: minimize total cost of selected routes.
    prob += pulp.lpDot(costs, selected)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "total_cost": float(pulp.value(prob.objective)),
    }
