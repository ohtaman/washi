import pulp


def solve(
    targetBatch,
    costs,
    availabilities,
    compositions,
    minRatios,
    maxRatios,
) -> dict:
    """Return {"amounts": list[float], "totalCost": float}."""
    target = targetBatch
    min_ratios = minRatios
    max_ratios = maxRatios
    n_raw = len(costs)
    n_elem = len(min_ratios)

    prob = pulp.LpProblem("blending", pulp.LpMinimize)

    amounts = [
        pulp.LpVariable(f"amt_{i}", lowBound=0, upBound=avail)
        for i, avail in enumerate(availabilities)
    ]

    prob += pulp.lpSum(amounts) == target

    for k in range(n_elem):
        elem_expr = pulp.lpSum(compositions[i][k] * amounts[i] for i in range(n_raw))
        prob += elem_expr >= min_ratios[k] * target
        prob += elem_expr <= max_ratios[k] * target

    prob += pulp.lpDot(costs, amounts)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "amounts": [float(pulp.value(v)) for v in amounts],
        "totalCost": float(pulp.value(prob.objective)),
    }
