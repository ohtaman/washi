import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "reducedCosts": list[float], "optimalCost": float}."""
    costs = input_data["costs"]
    yields = input_data["yields"]
    min_reqs = input_data["minRequirements"]
    n = len(costs)

    prob = pulp.LpProblem("reduced_costs", pulp.LpMinimize)

    quantities = [pulp.LpVariable(f"x_{j}", lowBound=0) for j in range(n)]

    # TODO:
    # 1. Add >= constraints for each requirement in min_reqs
    # 2. Minimize lpDot(costs, quantities), call prob.solve(pulp.HiGHS(msg=False))
    # 3. Return {"quantities": ..., "reducedCosts": [v.dj ...], "optimalCost": ...}
    raise NotImplementedError("Not implemented")
