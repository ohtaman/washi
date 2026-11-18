import highspy


def solve(input_data: dict) -> dict:
    margins = input_data["margins"]
    usages = input_data["usages"]
    capacities = input_data["capacities"]
    n = len(margins)

    h = highspy.Highs()
    h.silent()

    quantities = [h.addVariable(lb=0.0, name=f"q_{j}") for j in range(n)]
    constrs = [
        h.addConstr(h.qsum(usages[k][j] * quantities[j] for j in range(n)) <= cap)
        for k, cap in enumerate(capacities)
    ]

    h.maximize(h.qsum(margins[j] * quantities[j] for j in range(n)))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    sol = h.getSolution()
    shadow_prices = [float(sol.row_dual[c.index]) for c in constrs]
    slacks = [float(cap - sol.row_value[c.index]) for cap, c in zip(capacities, constrs)]

    return {
        "quantities": [float(h.val(v)) for v in quantities],
        "optimalProfit": float(h.getObjectiveValue()),
        "shadowPrices": shadow_prices,
        "slacks": slacks,
        "isBottleneck": [d > 1e-5 for d in shadow_prices],
    }
