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
    """Return {"quantities": list[float], "shortfalls": list[float], "excesses": list[float], "totalCost": float}."""
    n = len(unit_costs)

    prob = pulp.LpProblem("elastic_soft_penalties", pulp.LpMinimize)

    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n)]
    shortfalls = [pulp.LpVariable(f"s_neg_{j}", lowBound=0) for j in range(n)]
    excesses = [pulp.LpVariable(f"s_pos_{j}", lowBound=0) for j in range(n)]

    for j in range(n):
        prob += quantities[j] + shortfalls[j] - excesses[j] == targets[j]
    prob += pulp.lpDot(hours, quantities) <= machine_cap
    prob += pulp.lpSum(quantities) >= min_total

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
        "totalCost": float(pulp.value(prob.objective)),
    }
