import pulp


def solve(num_elements, costs, sets) -> dict:
    """Return {"selected": list[int], "total_cost": float}."""
    m_count = len(costs)

    prob = pulp.LpProblem("set_covering", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"set_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    for i in range(num_elements):
        prob += pulp.lpSum(selected[j] for j in range(m_count) if i in sets[j]) >= 1

    prob += pulp.lpDot(costs, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "total_cost": float(pulp.value(prob.objective)),
    }
