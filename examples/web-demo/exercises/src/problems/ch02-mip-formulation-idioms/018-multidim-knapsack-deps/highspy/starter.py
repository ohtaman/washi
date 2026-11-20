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

    # TODO:
    # 1. Enforce each resource capacity: lpDot(weights[k], selected) <= capacities[k]
    # 2. Add prerequisites (selected[a] <= selected[b]) and incompatibles (selected[c] + selected[d] <= 1)
    # 3. Maximize total value, solve with HiGHS, and return {"selected": ..., "totalValue": ...}
    raise NotImplementedError("Not implemented")
