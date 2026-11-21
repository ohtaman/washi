import pulp


def solve(
    minOrders,
    maxOrders,
    baseCosts,
    discounts,
    contractFees,
    totalDemand,
) -> dict:
    """Return {"b": list[int], "x": list[float], "z": list[float], "totalCost": float}."""
    min_ord = minOrders
    max_ord = maxOrders
    base_costs = baseCosts
    fees = contractFees
    demand = totalDemand
    n = len(min_ord)

    prob = pulp.LpProblem("glover_product", pulp.LpMinimize)

    # TODO: Build and solve the linearized contract procurement MIP, then return the output.
    raise NotImplementedError("Not implemented")
