import pulp


def solve(values, weights, capacities, prerequisites, incompatibles) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    n = len(values)

    prob = pulp.LpProblem("multidim_knapsack_deps", pulp.LpMaximize)
    selected = [pulp.LpVariable(f"item_{j}", cat=pulp.LpBinary) for j in range(n)]

    # TODO: Enforce all resource capacities, prerequisites, and incompatibilities, maximize total value, and return the result.
    raise NotImplementedError("Not implemented")
