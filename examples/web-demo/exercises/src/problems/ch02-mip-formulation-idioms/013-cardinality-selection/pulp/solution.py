import pulp


def solve(
    budget,
    costs,
    values,
    mutex_groups,
    exact_groups,
    at_least_one_groups,
) -> dict:
    """Return {"selected": list[int], "total_value": float}."""
    n = len(costs)

    prob = pulp.LpProblem("cardinality_selection", pulp.LpMaximize)
    # Decision variables: binary indicator (1 if item i is selected, 0 otherwise).
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # Budget limit and group cardinality constraints: at most 1 (mutex), exact count, and at least 1.
    prob += pulp.lpDot(costs, selected) <= budget
    for group in mutex_groups:
        prob += pulp.lpSum(selected[i] for i in group) <= 1
    for rule in exact_groups:
        prob += pulp.lpSum(selected[i] for i in rule["indices"]) == rule["count"]
    for group in at_least_one_groups:
        prob += pulp.lpSum(selected[i] for i in group) >= 1

    # Objective: maximize total value of selected items.
    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "total_value": float(pulp.value(prob.objective)),
    }
