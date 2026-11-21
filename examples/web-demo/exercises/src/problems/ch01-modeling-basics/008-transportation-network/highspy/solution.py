import pulp


def solve(supplies, demands, unit_costs) -> dict:
    """Return {"shipments": list[list[float]], "totalCost": float}."""
    n_s = len(supplies)
    n_d = len(demands)

    prob = pulp.LpProblem("transportation", pulp.LpMinimize)

    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_s)
    ]

    for i in range(n_s):
        prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= supplies[i]
    for j in range(n_d):
        prob += pulp.lpSum(shipments[i][j] for i in range(n_s)) >= demands[j]

    prob += pulp.lpSum(
        unit_costs[i][j] * shipments[i][j] for i in range(n_s) for j in range(n_d)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "shipments": [[float(pulp.value(v)) for v in row] for row in shipments],
        "totalCost": float(pulp.value(prob.objective)),
    }
