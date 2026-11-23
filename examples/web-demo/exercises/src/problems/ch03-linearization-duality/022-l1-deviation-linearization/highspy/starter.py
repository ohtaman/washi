import pulp


def solve(targets, weights, upper_bounds, costs, budget, total_output) -> dict:
    """Return {"allocations": list[float], "totalDeviation": float}."""
    n = len(targets)

    prob = pulp.LpProblem("l1_deviation", pulp.LpMinimize)

    # TODO: Build and solve the weighted L1 deviation LP, then return the output.
    raise NotImplementedError("Not implemented")
