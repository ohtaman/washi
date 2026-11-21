import pulp


def solve(budget, costs, values, mutexGroups, exactGroups, atLeastOneGroups) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    mutex_groups = mutexGroups
    exact_groups = exactGroups
    at_least_one_groups = atLeastOneGroups
    n = len(costs)

    prob = pulp.LpProblem("cardinality_selection", pulp.LpMaximize)
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # TODO: Enforce budget and group cardinality rules, maximize total value, and return the result.
    raise NotImplementedError("Not implemented")
