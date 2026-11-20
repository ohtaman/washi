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

    prob += pulp.lpSum(allocations) == total_output
    prob += pulp.lpDot(costs, allocations) <= budget
    for i in range(n):
        prob += allocations[i] - targets[i] == d_plus[i] - d_minus[i]

    prob += pulp.lpDot(weights, d_plus) + pulp.lpDot(weights, d_minus)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "allocations": [float(pulp.value(v)) for v in allocations],
        "totalDeviation": float(pulp.value(prob.objective)),
    }
