import pulp


def solve(denominations, max_counts, target_amount) -> dict:
    """Return {"counts": list[int], "total_coins": int}."""
    prob = pulp.LpProblem("coin_change", pulp.LpMinimize)


    # Decision variables: integer count of each coin denomination, bounded by available stock.
    counts = [
        pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
        for i, cap in enumerate(max_counts)
    ]

    # Total monetary value must equal the target amount.
    prob += pulp.lpDot(denominations, counts) == target_amount

    # Objective: minimize total number of coins used.
    prob += pulp.lpSum(counts)
    prob.solve(pulp.HiGHS(msg=False))

    # Round solver values to exact integers to remove floating-point tolerance noise.
    return {
        "counts": [round(pulp.value(c)) for c in counts],
        "total_coins": round(pulp.value(prob.objective)),
    }
