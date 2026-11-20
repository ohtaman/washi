import pulp


def solve(input_data: dict) -> dict:
    """Return {"amounts": list[float], "totalCost": float}."""
    target = input_data["targetBatch"]
    costs = input_data["costs"]
    availabilities = input_data["availabilities"]
    compositions = input_data["compositions"]
    min_ratios = input_data["minRatios"]
    max_ratios = input_data["maxRatios"]

    prob = pulp.LpProblem("blending", pulp.LpMinimize)

    amounts = [
        pulp.LpVariable(f"amt_{i}", lowBound=0, upBound=avail)
        for i, avail in enumerate(availabilities)
    ]

    # TODO: Add total weight == target constraint, element min/max ratio constraints,
    # set total cost objective, call prob.solve(pulp.HiGHS(msg=False)),
    # and return {"amounts": [...], "totalCost": ...}.
    raise NotImplementedError("Not implemented")
