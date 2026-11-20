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

    allocations = [
        pulp.LpVariable(f"x_{i}", lowBound=0, upBound=float(upper_bounds[i]))
        for i in range(n)
    ]
    d_plus = [pulp.LpVariable(f"dp_{i}", lowBound=0) for i in range(n)]
    d_minus = [pulp.LpVariable(f"dm_{i}", lowBound=0) for i in range(n)]

    # TODO:
    # 1. Enforce total output equality and budget <= budget
    # 2. Split deviations: allocations[i] - targets[i] == d_plus[i] - d_minus[i]
    # 3. Minimize sum_i weights[i] * (d_plus[i] + d_minus[i]),
    #    call prob.solve(pulp.HiGHS(msg=False)), and return {"allocations": ..., "totalDeviation": ...}
    raise NotImplementedError("Not implemented")
