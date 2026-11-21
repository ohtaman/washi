import pulp


def solve(margins, min_batches, max_batches, resource_usages, resource_cap) -> dict:
    """Return {"active": list[int], "quantities": list[float], "totalMargin": float}."""
    usages = resource_usages
    cap = resource_cap
    n = len(margins)

    prob = pulp.LpProblem("semi_continuous_production", pulp.LpMaximize)

    active = [pulp.LpVariable(f"active_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    for i in range(n):
        prob += min_batches[i] * active[i] <= quantities[i]
        prob += quantities[i] <= max_batches[i] * active[i]
    prob += pulp.lpDot(usages, quantities) <= cap

    prob += pulp.lpDot(margins, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "active": [round(pulp.value(v)) for v in active],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "totalMargin": float(pulp.value(prob.objective)),
    }
