import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    values = input_data["values"]
    weights = input_data["weights"]
    capacities = input_data["capacities"]
    prerequisites = input_data["prerequisites"]
    incompatibles = input_data["incompatibles"]
    n = len(values)

    prob = pulp.LpProblem("multidim_knapsack_deps", pulp.LpMaximize)
    selected = [pulp.LpVariable(f"item_{j}", cat=pulp.LpBinary) for j in range(n)]

    for k, cap in enumerate(capacities):
        prob += pulp.lpDot(weights[k], selected) <= cap
    for a, b in prerequisites:
        prob += selected[a] <= selected[b]
    for c, d in incompatibles:
        prob += selected[c] + selected[d] <= 1

    prob += pulp.lpDot(values, selected)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "totalValue": float(pulp.value(prob.objective)),
    }
