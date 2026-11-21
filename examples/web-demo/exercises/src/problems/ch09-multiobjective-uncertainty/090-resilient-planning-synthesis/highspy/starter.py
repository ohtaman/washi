import pulp


def solve(
    fixedCosts,
    capacities,
    dropAmounts,
    gamma,
    robustMinCap,
    probs,
    demands,
    offline,
    disruptionCost,
    shortfallPenalty,
) -> dict:
    """Return {"committed": list[int], "recovered": list[list[int]], "totalCost": float}."""
    # TODO: Build and solve the resilient planning and recovery MIP, then return the output.
    raise NotImplementedError("Not implemented")
