import pulp


def solve(
    costs,
    capacities,
    yields,
    min_requirements,
    resource_usages,
    max_resources,
) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimal_cost": float}."""
    min_reqs = min_requirements
    usages = resource_usages
    max_res = max_resources
    n = len(costs)

    prob = pulp.LpProblem("shadow_prices", pulp.LpMinimize)

    # TODO: Build and solve the dispatch LP, then return quantities, shadow duals, and optimalCost.
    raise NotImplementedError("Not implemented")
