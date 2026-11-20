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

    # TODO:
    # 1. Add budget constraint <= budget
    # 2. Add mutex (<= 1), exact-k (== count), and at-least-one (>= 1) group constraints
    # 3. Maximize total value, solve with HiGHS, and return {"selected": ..., "totalValue": ...}
    raise NotImplementedError("Not implemented")
