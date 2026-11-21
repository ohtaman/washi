import pulp


def solve(input_data: dict) -> dict:
    """Return {"allocations": list[float], "totalDeviation": float}."""
    targets = input_data["targets"]
    weights = input_data["weights"]
    upper_bounds = input_data["upperBounds"]
    costs = input_data["costs"]
    budget = input_data["budget"]
    total_output = input_data["totalOutput"]
    n = len(targets)

    prob = pulp.LpProblem("l1_deviation", pulp.LpMinimize)

    # TODO: Build and solve the weighted L1 deviation LP, then return the output.
    raise NotImplementedError("Not implemented")
