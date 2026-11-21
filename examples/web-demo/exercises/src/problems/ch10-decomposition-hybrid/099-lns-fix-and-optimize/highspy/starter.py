import pulp


def solve(
    demands,
    setupCosts,
    prodCosts,
    holdCost,
    capacities,
    initialPlan,
    windowSize,
) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "totalCost": float}."""
    # TODO: Improve the initial lot-sizing plan via Fix-and-Optimize LNS and return the schedule.
    raise NotImplementedError("Not implemented")
