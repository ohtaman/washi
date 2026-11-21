import pulp


def solve(margins, usages, capacities) -> dict:
    """Return {"quantities": list[float], "totalProfit": float}."""
    n_products = len(margins)

    prob = pulp.LpProblem("product_mix", pulp.LpMaximize)

    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n_products)]

    # TODO:
    # 1. For each k, cap in enumerate(capacities), add resource usage <= cap
    # 2. Set the objective `prob += ...` on total margin and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Return {"quantities": [float(pulp.value(v)) for v in quantities], "totalProfit": float(pulp.value(prob.objective))}
    raise NotImplementedError("Not implemented")
