import pulp


def solve(
    targetBatch,
    costs,
    availabilities,
    compositions,
    minRatios,
    maxRatios,
) -> dict:
    """Return {"amounts": list[float], "totalCost": float}."""
    target = targetBatch
    min_ratios = minRatios
    max_ratios = maxRatios

    prob = pulp.LpProblem("blending", pulp.LpMinimize)

    amounts = [
        pulp.LpVariable(f"amt_{i}", lowBound=0, upBound=avail)
        for i, avail in enumerate(availabilities)
    ]

    # TODO: Add total weight == target constraint, element min/max ratio constraints,
    # set total cost objective, call prob.solve(pulp.HiGHS(msg=False)),
    # and return {"amounts": [...], "totalCost": ...}.
    raise NotImplementedError("Not implemented")
