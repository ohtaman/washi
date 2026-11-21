import pulp


def solve(targets, weights, upperBounds, costs, budget, totalOutput) -> dict:
    """Return {"allocations": list[float], "totalDeviation": float}."""
    upper_bounds = upperBounds
    total_output = totalOutput
    n = len(targets)

    prob = pulp.LpProblem("l1_deviation", pulp.LpMinimize)

    # TODO: Build and solve the weighted L1 deviation LP, then return the output.
    raise NotImplementedError("Not implemented")
