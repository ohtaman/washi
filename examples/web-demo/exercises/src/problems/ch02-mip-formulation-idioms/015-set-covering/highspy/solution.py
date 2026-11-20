import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    num_elements = input_data["numElements"]
    costs = input_data["costs"]
    sets = input_data["sets"]
    m_count = len(costs)

    prob = pulp.LpProblem("set_covering", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"set_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    for i in range(num_elements):
        prob += pulp.lpSum(selected[j] for j in range(m_count) if i in sets[j]) >= 1

    prob += pulp.lpDot(costs, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "totalCost": float(pulp.value(prob.objective)),
    }
