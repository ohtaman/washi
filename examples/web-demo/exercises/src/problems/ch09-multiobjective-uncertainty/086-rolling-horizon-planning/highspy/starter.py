import pulp


def solve(
    actualDemands,
    forecastDemands,
    prodCosts,
    prodCap,
    holdCost,
    shortfallPenalty,
    initialInventory,
    windowLen,
) -> dict:
    """Return {"produced": list[float], "inventories": list[float], "shortfalls": list[float], "totalCost": float}."""
    # TODO: Run the rolling-horizon MPC loop over all periods and return the output.
    raise NotImplementedError("Not implemented")
