import pulp


def solve(supplies, demands, fixed_costs, unit_costs, capacities) -> dict:
    """Return {"open": list[list[int]], "shipments": list[list[float]], "totalCost": float}."""
    n_s, n_d = len(supplies), len(demands)

    prob = pulp.LpProblem("fixed_charge_network", pulp.LpMinimize)

    open_vars = [
        [pulp.LpVariable(f"open_{i}_{j}", cat=pulp.LpBinary) for j in range(n_d)]
        for i in range(n_s)
    ]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_s)
    ]

    for i in range(n_s):
        for j in range(n_d):
            prob += shipments[i][j] <= capacities[i][j] * open_vars[i][j]
        prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= supplies[i]
    for j in range(n_d):
        prob += pulp.lpSum(shipments[i][j] for i in range(n_s)) >= demands[j]

    prob += pulp.lpSum(
        fixed_costs[i][j] * open_vars[i][j] + unit_costs[i][j] * shipments[i][j]
        for i in range(n_s)
        for j in range(n_d)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "open": [[round(pulp.value(open_vars[i][j])) for j in range(n_d)] for i in range(n_s)],
        "shipments": [[float(pulp.value(shipments[i][j])) for j in range(n_d)] for i in range(n_s)],
        "totalCost": float(pulp.value(prob.objective)),
    }
