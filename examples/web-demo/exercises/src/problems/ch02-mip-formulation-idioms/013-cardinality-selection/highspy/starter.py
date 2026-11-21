import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    budget = input_data["budget"]
    costs = input_data["costs"]
    values = input_data["values"]
    mutex_groups = input_data["mutexGroups"]
    exact_groups = input_data["exactGroups"]
    at_least_one_groups = input_data["atLeastOneGroups"]
    n = len(costs)

    prob = pulp.LpProblem("cardinality_selection", pulp.LpMaximize)
    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # TODO: Enforce budget and group cardinality rules, maximize total value, and return the result.
    raise NotImplementedError("Not implemented")
