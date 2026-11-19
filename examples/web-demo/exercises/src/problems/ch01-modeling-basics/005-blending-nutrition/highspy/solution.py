import highspy


def solve(input_data: dict) -> dict:
    target = input_data["targetBatch"]
    costs = input_data["costs"]
    availabilities = input_data["availabilities"]
    compositions = input_data["compositions"]
    min_ratios = input_data["minRatios"]
    max_ratios = input_data["maxRatios"]
    n_raw = len(costs)
    n_elem = len(min_ratios)

    h = highspy.Highs()
    h.silent()

    amounts = [
        h.addVariable(lb=0.0, ub=avail, name=f"amt_{i}")
        for i, avail in enumerate(availabilities)
    ]

    h.addConstr(h.qsum(amounts) == target)

    for k in range(n_elem):
        elem_expr = h.qsum(compositions[i][k] * amounts[i] for i in range(n_raw))
        h.addConstr(elem_expr >= min_ratios[k] * target)
        h.addConstr(elem_expr <= max_ratios[k] * target)

    h.minimize(h.qsum(costs[i] * amounts[i] for i in range(n_raw)))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "amounts": [float(h.val(v)) for v in amounts],
        "totalCost": float(h.getObjectiveValue()),
    }
