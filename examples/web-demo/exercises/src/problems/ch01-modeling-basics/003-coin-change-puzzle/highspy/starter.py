import pulp


def solve(denominations, max_counts, target_amount) -> dict:
    """Return {"counts": list[int], "total_coins": int}."""
    prob = pulp.LpProblem("coin_change", pulp.LpMinimize)


    # TODO 1: Switch `cat=pulp.LpContinuous` to `cat=pulp.LpInteger` and set `upBound=cap`
    counts = [
        pulp.LpVariable(f"coin_{i}", lowBound=0, cat=pulp.LpContinuous)
        for i in range(len(denominations))
    ]

    # TODO 2: Add the exact target amount constraint == target_amount

    prob += pulp.lpSum(counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [float(pulp.value(c)) for c in counts],
        "total_coins": float(pulp.value(prob.objective)),
    }
