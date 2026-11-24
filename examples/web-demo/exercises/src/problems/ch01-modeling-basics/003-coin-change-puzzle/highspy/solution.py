import pulp


def solve(denominations, max_counts, target_amount) -> dict:
    """Return {"counts": list[int], "total_coins": int}."""
    prob = pulp.LpProblem("coin_change", pulp.LpMinimize)


    counts = [
        pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
        for i, cap in enumerate(max_counts)
    ]

    prob += pulp.lpDot(denominations, counts) == target_amount

    prob += pulp.lpSum(counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [round(pulp.value(c)) for c in counts],
        "total_coins": round(pulp.value(prob.objective)),
    }
