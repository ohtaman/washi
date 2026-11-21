import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimalCost": float}."""
    costs = input_data["costs"]
    capacities = input_data["capacities"]
    yields = input_data["yields"]
    min_reqs = input_data["minRequirements"]
    usages = input_data["resourceUsages"]
    max_res = input_data["maxResources"]
    n = len(costs)

    prob = pulp.LpProblem("shadow_prices", pulp.LpMinimize)

    # TODO: Build and solve the dispatch LP, then return quantities, shadow duals, and optimalCost.
    raise NotImplementedError("Not implemented")
