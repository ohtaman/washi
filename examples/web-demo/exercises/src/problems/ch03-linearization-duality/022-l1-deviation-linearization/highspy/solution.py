import pulp


def solve(targets, weights, upper_bounds, costs, budget, total_output) -> dict:
    """Return {"allocations": list[float], "total_deviation": float}."""
    n = len(targets)

    prob = pulp.LpProblem("l1_deviation", pulp.LpMinimize)

    # Decision variables: allocations[i] in [0, upper_bounds[i]], plus non-negative split variables
    # d_plus[i] and d_minus[i] representing positive and negative deviations from targets[i].
    allocations = [
        pulp.LpVariable(f"x_{i}", lowBound=0, upBound=float(upper_bounds[i]))
        for i in range(n)
    ]
    d_plus = [pulp.LpVariable(f"dp_{i}", lowBound=0) for i in range(n)]
    d_minus = [pulp.LpVariable(f"dm_{i}", lowBound=0) for i in range(n)]

    # Total output, budget, and L1 deviation linearization constraints (x_i - target_i = dp_i - dm_i).
    prob += pulp.lpSum(allocations) == total_output
    prob += pulp.lpDot(costs, allocations) <= budget
    for i in range(n):
        prob += allocations[i] - targets[i] == d_plus[i] - d_minus[i]

    # Objective: minimize weighted L1 deviation sum(weights[i] * |x_i - targets[i]|).
    prob += pulp.lpDot(weights, d_plus) + pulp.lpDot(weights, d_minus)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "allocations": [float(pulp.value(v)) for v in allocations],
        "total_deviation": float(pulp.value(prob.objective)),
    }
