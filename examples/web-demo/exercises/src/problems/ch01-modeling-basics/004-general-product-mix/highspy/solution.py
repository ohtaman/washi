import pulp


def solve(margins, usages, capacities) -> dict:
    """Return {"quantities": list[float], "total_profit": float}."""
    n_products = len(margins)

    prob = pulp.LpProblem("product_mix", pulp.LpMaximize)

    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n_products)]

    for k, cap in enumerate(capacities):
        prob += pulp.lpDot(usages[k], quantities) <= cap

    prob += pulp.lpDot(margins, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "total_profit": float(pulp.value(prob.objective)),
    }
