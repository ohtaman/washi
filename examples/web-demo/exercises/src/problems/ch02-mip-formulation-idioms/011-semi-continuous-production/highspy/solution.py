import pulp


def solve(input_data: dict) -> dict:
    """Return {"active": list[int], "quantities": list[float], "totalMargin": float}."""
    margins = input_data["margins"]
    min_batches = input_data["minBatches"]
    max_batches = input_data["maxBatches"]
    usages = input_data["resourceUsages"]
    cap = input_data["resourceCap"]
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
