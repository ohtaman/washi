import pulp


def solve(max_weight, weights, values, max_counts) -> dict:
    """Return {"counts": list[int], "totalValue": int}."""
    prob = pulp.LpProblem("carry_on", pulp.LpMaximize)


    counts = [
        pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
        for i, cap in enumerate(max_counts)
    ]

    prob += pulp.lpDot(weights, counts) <= max_weight

    prob += pulp.lpDot(values, counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [round(pulp.value(c)) for c in counts],
        "totalValue": round(pulp.value(prob.objective)),
    }
