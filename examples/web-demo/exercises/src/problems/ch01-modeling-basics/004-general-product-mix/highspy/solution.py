import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "totalProfit": float}."""
    margins = input_data["margins"]
    usages = input_data["usages"]
    capacities = input_data["capacities"]
    n_products = len(margins)

    prob = pulp.LpProblem("product_mix", pulp.LpMaximize)

    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n_products)]

    for k, cap in enumerate(capacities):
        prob += pulp.lpDot(usages[k], quantities) <= cap

    prob += pulp.lpDot(margins, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "totalProfit": float(pulp.value(prob.objective)),
    }
