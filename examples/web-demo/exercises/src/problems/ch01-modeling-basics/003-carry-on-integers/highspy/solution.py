import highspy


def solve(input_data: dict) -> dict:
    """Return {"counts": list[int], "totalValue": int}."""
    h = highspy.Highs()
    h.silent()

    weights = input_data["weights"]
    values = input_data["values"]
    max_counts = input_data["maxCounts"]

    counts = [
        h.addIntegral(lb=0, ub=cap, name=f"item_{i}")
        for i, cap in enumerate(max_counts)
    ]

    h.addConstr(
        h.qsum(weights[i] * counts[i] for i in range(len(counts)))
        <= input_data["maxWeight"]
    )

    h.maximize(h.qsum(values[i] * counts[i] for i in range(len(counts))))

    return {
        "counts": [round(h.val(c)) for c in counts],
        "totalValue": round(h.getObjectiveValue()),
    }
