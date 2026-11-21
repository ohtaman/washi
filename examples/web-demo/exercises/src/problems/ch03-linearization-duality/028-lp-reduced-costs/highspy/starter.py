import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "reducedCosts": list[float], "optimalCost": float}."""
    costs = input_data["costs"]
    yields = input_data["yields"]
    min_reqs = input_data["minRequirements"]
    n = len(costs)

    prob = pulp.LpProblem("reduced_costs", pulp.LpMinimize)

    # TODO: Build and solve the production LP, then return quantities, reducedCosts, and optimalCost.
    raise NotImplementedError("Not implemented")
