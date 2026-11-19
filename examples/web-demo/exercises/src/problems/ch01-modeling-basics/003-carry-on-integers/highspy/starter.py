import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    weights = input_data["weights"]
    values = input_data["values"]
    max_counts = input_data["maxCounts"]

    # TODO 1: Switch `addVariable` to `addIntegral`!
    counts = [
        h.addVariable(lb=0, ub=cap, name=f"item_{i}")
        for i, cap in enumerate(max_counts)
    ]

    # TODO 2: Add the weight limit constraint <= input_data["maxWeight"]

    h.maximize(h.qsum(values[i] * counts[i] for i in range(len(counts))))

    return {
        "counts": [float(h.val(c)) for c in counts],
        "totalValue": float(h.getObjectiveValue()),
    }
