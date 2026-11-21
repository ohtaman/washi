import pulp


def solve(
    budget,
    costs,
    values,
    mutex_groups,
    exact_groups,
    at_least_one_groups,
) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    n = len(costs)

    prob = pulp.LpProblem("cardinality_selection", pulp.LpMaximize)
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    prob += pulp.lpDot(costs, selected) <= budget
    for group in mutex_groups:
        prob += pulp.lpSum(selected[i] for i in group) <= 1
    for rule in exact_groups:
        prob += pulp.lpSum(selected[i] for i in rule["indices"]) == rule["count"]
    for group in at_least_one_groups:
        prob += pulp.lpSum(selected[i] for i in group) >= 1

    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "totalValue": float(pulp.value(prob.objective)),
    }
