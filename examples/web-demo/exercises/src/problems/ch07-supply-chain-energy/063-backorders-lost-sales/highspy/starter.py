import pulp


def solve(
    demands,
    capacities,
    prodCosts,
    unitPrice,
    holdCost,
    backorderCost,
    lostSalePenalty,
    initialInventory,
) -> dict:
    """Return {"production": list[float], "sales": list[float], "inventory": list[float], "backlog": list[float], "lostSales": list[float], "netProfit": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
