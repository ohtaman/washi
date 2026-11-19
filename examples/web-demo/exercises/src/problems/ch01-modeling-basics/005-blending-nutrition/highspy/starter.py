import highspy


def solve(input_data: dict) -> dict:
    target = input_data["targetBatch"]
    costs = input_data["costs"]
    availabilities = input_data["availabilities"]
    compositions = input_data["compositions"]
    min_ratios = input_data["minRatios"]
    max_ratios = input_data["maxRatios"]

    h = highspy.Highs()
    h.silent()

    amounts = [
        h.addVariable(lb=0.0, ub=avail, name=f"amt_{i}")
        for i, avail in enumerate(availabilities)
    ]

    # TODO: Add total weight == target constraint, element min/max ratio constraints,
    # minimize total cost, and return {"amounts": [...], "totalCost": ...}.
    raise NotImplementedError("Not implemented")
