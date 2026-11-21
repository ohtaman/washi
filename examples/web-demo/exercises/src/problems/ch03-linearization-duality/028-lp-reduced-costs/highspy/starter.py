import pulp


def solve(costs, yields, min_requirements) -> dict:
    """Return {"quantities": list[float], "reducedCosts": list[float], "optimalCost": float}."""
    min_reqs = min_requirements
    n = len(costs)

    prob = pulp.LpProblem("reduced_costs", pulp.LpMinimize)

    # TODO: Build and solve the production LP, then return quantities, reducedCosts, and optimalCost.
    raise NotImplementedError("Not implemented")
