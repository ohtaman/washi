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
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # TODO: Enforce budget and group cardinality rules, maximize total value, and return the result.
    raise NotImplementedError("Not implemented")
