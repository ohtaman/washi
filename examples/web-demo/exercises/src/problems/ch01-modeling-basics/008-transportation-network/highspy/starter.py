import pulp


def solve(supplies, demands, unitCosts) -> dict:
    """Return {"shipments": list[list[float]], "totalCost": float}."""
    unit_costs = unitCosts
    n_s = len(supplies)
    n_d = len(demands)

    prob = pulp.LpProblem("transportation", pulp.LpMinimize)

    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_s)
    ]

    # TODO:
    # 1. Enforce row sum <= supplies[i] and column sum >= demands[j]
    # 2. Set objective `prob += ...` on sum(unit_costs[i][j] * shipments[i][j]) and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Return {"shipments": [[float(pulp.value(v)) for v in row] for row in shipments], "totalCost": float(pulp.value(prob.objective))}
    raise NotImplementedError("Not implemented")
