import pulp


def solve(
    externalDemands,
    bom,
    leadTimes,
    initialInventory,
    setupCosts,
    prodCosts,
    holdCosts,
    capacities,
) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[int]], "inventory": list[list[float]], "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
