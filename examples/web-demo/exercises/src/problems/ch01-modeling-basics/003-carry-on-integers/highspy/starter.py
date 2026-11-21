import pulp


def solve(maxWeight, weights, values, maxCounts) -> dict:
    """Return {"counts": list[int], "totalValue": int}."""
    prob = pulp.LpProblem("carry_on", pulp.LpMaximize)

    max_counts = maxCounts

    # TODO 1: Switch `cat=pulp.LpContinuous` to `cat=pulp.LpInteger`!
    counts = [
        pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpContinuous)
        for i, cap in enumerate(max_counts)
    ]

    # TODO 2: Add the weight limit constraint <= maxWeight

    prob += pulp.lpDot(values, counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [float(pulp.value(c)) for c in counts],
        "totalValue": float(pulp.value(prob.objective)),
    }
