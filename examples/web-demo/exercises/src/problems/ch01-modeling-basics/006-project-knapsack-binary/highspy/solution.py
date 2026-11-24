import pulp


def solve(budget, costs, values) -> dict:
    """Return {"selected": list[int], "total_value": float}."""
    n = len(costs)

    prob = pulp.LpProblem("project_knapsack", pulp.LpMaximize)

    # Decision variables: binary indicator (1 if project i is selected, 0 otherwise).
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # Knapsack capacity constraint: total cost of selected projects cannot exceed budget.
    prob += pulp.lpDot(costs, selected) <= budget
    # Objective: maximize total value of selected projects.
    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary values to exact integers to remove floating-point tolerance noise.
    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "total_value": float(pulp.value(prob.objective)),
    }
