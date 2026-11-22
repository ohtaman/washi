import pulp


def solve(input_data: dict) -> dict:
    """Return {"counts": list[int], "totalCoins": int}."""
    prob = pulp.LpProblem("coin_change", pulp.LpMinimize)

    denominations = input_data["denominations"]
    max_counts = input_data["maxCounts"]

    counts = [
        pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
        for i, cap in enumerate(max_counts)
    ]

    prob += pulp.lpDot(denominations, counts) == input_data["targetAmount"]

    prob += pulp.lpSum(counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [round(pulp.value(c)) for c in counts],
        "totalCoins": round(pulp.value(prob.objective)),
    }
