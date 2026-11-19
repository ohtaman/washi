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

    # TODO:
    # 1. For each k, cap in enumerate(capacities), add resource usage <= cap
    # 2. Call h.maximize(...) on total margin
    # 3. Return {"quantities": [float(h.val(v)) for v in quantities], "totalProfit": float(h.getObjectiveValue())}
    raise NotImplementedError("Not implemented")
