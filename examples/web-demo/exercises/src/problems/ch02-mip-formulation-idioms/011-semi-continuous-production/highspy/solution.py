import pulp


def solve(margins, min_batches, max_batches, resource_usages, resource_cap) -> dict:
    """Return {"active": list[int], "quantities": list[float], "total_margin": float}."""
    usages = resource_usages
    cap = resource_cap
    n = len(margins)

    prob = pulp.LpProblem("semi_continuous_production", pulp.LpMaximize)

    # Decision variables: binary active[i] (whether product i is made) and continuous quantities[i] >= 0.
    active = [pulp.LpVariable(f"active_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    # Semi-continuous domain: quantities[i] is either 0 (active[i]=0) or in [min_batches[i], max_batches[i]] (active[i]=1).
    for i in range(n):
        prob += min_batches[i] * active[i] <= quantities[i]
        prob += quantities[i] <= max_batches[i] * active[i]
    # Shared resource capacity constraint.
    prob += pulp.lpDot(usages, quantities) <= cap

    # Objective: maximize total margin across all products.
    prob += pulp.lpDot(margins, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "active": [round(pulp.value(v)) for v in active],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "total_margin": float(pulp.value(prob.objective)),
    }
