import pulp


def solve(
    target_batch,
    costs,
    availabilities,
    compositions,
    min_ratios,
    max_ratios,
) -> dict:
    """Return {"amounts": list[float], "totalCost": float}."""
    target = target_batch

    prob = pulp.LpProblem("blending", pulp.LpMinimize)

    amounts = [
        pulp.LpVariable(f"amt_{i}", lowBound=0, upBound=avail)
        for i, avail in enumerate(availabilities)
    ]

    # TODO: Add total weight == target constraint, element min/max ratio constraints,
    # set total cost objective, call prob.solve(pulp.HiGHS(msg=False)),
    # and return {"amounts": [...], "totalCost": ...}.
    raise NotImplementedError("Not implemented")
