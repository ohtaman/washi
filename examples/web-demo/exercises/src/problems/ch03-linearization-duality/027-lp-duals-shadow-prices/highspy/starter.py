import pulp


def solve(
    costs,
    capacities,
    yields,
    minRequirements,
    resourceUsages,
    maxResources,
) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimalCost": float}."""
    min_reqs = minRequirements
    usages = resourceUsages
    max_res = maxResources
    n = len(costs)

    prob = pulp.LpProblem("shadow_prices", pulp.LpMinimize)

    # TODO: Build and solve the dispatch LP, then return quantities, shadow duals, and optimalCost.
    raise NotImplementedError("Not implemented")
