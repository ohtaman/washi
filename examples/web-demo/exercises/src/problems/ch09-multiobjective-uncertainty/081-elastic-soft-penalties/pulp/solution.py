import pulp


def solve(
    unit_costs,
    hours,
    targets,
    shortfall_penalties,
    excess_penalties,
    machine_cap,
    min_total,
) -> dict:
    """Return {"quantities": list[float], "shortfalls": list[float], "excesses": list[float], "total_cost": float}."""
    n = len(unit_costs)

    prob = pulp.LpProblem("elastic_soft_penalties", pulp.LpMinimize)

    # Decision variables: production quantities and non-negative elastic slacks (shortfall/excess vs. targets)
    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n)]
    shortfalls = [pulp.LpVariable(f"s_neg_{j}", lowBound=0) for j in range(n)]
    excesses = [pulp.LpVariable(f"s_pos_{j}", lowBound=0) for j in range(n)]

    # Elastic target balance: quantities[j] = targets[j] - shortfalls[j] + excesses[j]
    for j in range(n):
        prob += quantities[j] + shortfalls[j] - excesses[j] == targets[j]
    # Hard machine-hour capacity and minimum total production requirements
    prob += pulp.lpDot(hours, quantities) <= machine_cap
    prob += pulp.lpSum(quantities) >= min_total

    # Minimize direct production cost plus linear soft-constraint violation penalties
    prob += (
        pulp.lpDot(unit_costs, quantities)
        + pulp.lpDot(shortfall_penalties, shortfalls)
        + pulp.lpDot(excess_penalties, excesses)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "shortfalls": [float(pulp.value(v)) for v in shortfalls],
        "excesses": [float(pulp.value(v)) for v in excesses],
        "total_cost": float(pulp.value(prob.objective)),
    }
