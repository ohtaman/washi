import pulp


def solve(budget, costs, values) -> dict:
    """Return {"selected": list[int], "total_value": float}."""
    n = len(costs)

    prob = pulp.LpProblem("project_knapsack", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    prob += pulp.lpDot(costs, selected) <= budget
    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "total_value": float(pulp.value(prob.objective)),
    }
