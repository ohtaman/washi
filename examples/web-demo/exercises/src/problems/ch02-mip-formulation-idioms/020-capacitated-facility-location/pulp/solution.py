import pulp


def solve(fixed_costs, capacities, demands, unit_costs) -> dict:
    """Return {"open": list[int], "shipments": list[list[float]], "total_cost": float}."""
    n_f, n_d = len(fixed_costs), len(demands)

    prob = pulp.LpProblem("capacitated_facility_location", pulp.LpMinimize)

    # Decision variables: binary open_vars[i] (facility i opened) and continuous shipments[i][j] >= 0.
    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n_f)]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_f)
    ]

    # Facility capacity linking (flow allowed only if open) and customer demand satisfaction.
    for i in range(n_f):
        prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= capacities[i] * open_vars[i]
    for j in range(n_d):
        prob += pulp.lpSum(shipments[i][j] for i in range(n_f)) >= demands[j]

    # Objective: minimize fixed facility opening costs plus variable shipping costs.
    prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpSum(
        unit_costs[i][j] * shipments[i][j] for i in range(n_f) for j in range(n_d)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "shipments": [[float(pulp.value(shipments[i][j])) for j in range(n_d)] for i in range(n_f)],
        "total_cost": float(pulp.value(prob.objective)),
    }
