import pulp


def solve(fixedCosts, capacities, demands, unitCosts) -> dict:
    """Return {"open": list[int], "shipments": list[list[float]], "totalCost": float}."""
    fixed_costs = fixedCosts
    unit_costs = unitCosts
    n_f, n_d = len(fixed_costs), len(demands)

    prob = pulp.LpProblem("capacitated_facility_location", pulp.LpMinimize)

    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n_f)]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_f)
    ]

    for i in range(n_f):
        prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= capacities[i] * open_vars[i]
    for j in range(n_d):
        prob += pulp.lpSum(shipments[i][j] for i in range(n_f)) >= demands[j]

    prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpSum(
        unit_costs[i][j] * shipments[i][j] for i in range(n_f) for j in range(n_d)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "shipments": [[float(pulp.value(shipments[i][j])) for j in range(n_d)] for i in range(n_f)],
        "totalCost": float(pulp.value(prob.objective)),
    }
