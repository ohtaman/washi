import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    budget = input_data["budget"]
    costs = input_data["costs"]
    values = input_data["values"]
    n = len(costs)

    prob = pulp.LpProblem("project_knapsack", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    prob += pulp.lpDot(costs, selected) <= budget
    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "totalValue": float(pulp.value(prob.objective)),
    }
