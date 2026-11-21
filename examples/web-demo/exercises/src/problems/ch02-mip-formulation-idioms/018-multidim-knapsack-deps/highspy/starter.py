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

    # TODO: Enforce all resource capacities, prerequisites, and incompatibilities, maximize total value, and return the result.
    raise NotImplementedError("Not implemented")
