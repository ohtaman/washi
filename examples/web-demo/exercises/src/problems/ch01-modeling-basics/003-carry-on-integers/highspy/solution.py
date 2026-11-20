import pulp


def solve(input_data: dict) -> dict:
    """Return {"counts": list[int], "totalValue": int}."""
    prob = pulp.LpProblem("carry_on", pulp.LpMaximize)

    weights = input_data["weights"]
    values = input_data["values"]
    max_counts = input_data["maxCounts"]

    counts = [
        pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
        for i, cap in enumerate(max_counts)
    ]

    prob += pulp.lpDot(weights, counts) <= input_data["maxWeight"]

    prob += pulp.lpDot(values, counts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "counts": [round(pulp.value(c)) for c in counts],
        "totalValue": round(pulp.value(prob.objective)),
    }
