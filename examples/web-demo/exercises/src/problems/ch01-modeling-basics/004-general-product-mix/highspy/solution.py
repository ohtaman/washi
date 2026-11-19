import highspy


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "totalProfit": float}."""
    margins = input_data["margins"]
    usages = input_data["usages"]
    capacities = input_data["capacities"]
    n_products = len(margins)

    h = highspy.Highs()
    h.silent()

    quantities = [h.addVariable(lb=0.0, name=f"q_{j}") for j in range(n_products)]

    for k, cap in enumerate(capacities):
        h.addConstr(
            h.qsum(usages[k][j] * quantities[j] for j in range(n_products)) <= cap
        )

    h.maximize(h.qsum(margins[j] * quantities[j] for j in range(n_products)))

    return {
        "quantities": [float(h.val(v)) for v in quantities],
        "totalProfit": float(h.getObjectiveValue()),
    }
