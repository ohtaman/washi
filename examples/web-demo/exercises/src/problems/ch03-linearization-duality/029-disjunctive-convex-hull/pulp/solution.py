import pulp


def solve(demand, band_lbs, band_ubs, fixed_costs, unit_costs) -> dict:
    """Return {"modes": list[int], "outputs": list[float], "total_cost": float}."""
    n_units = len(band_lbs)
    n_bands = len(band_lbs[0])

    prob = pulp.LpProblem("disjunctive_convex_hull", pulp.LpMinimize)

    # Decision variables for disjunctive convex hull:
    # binary y[i][k] selects operating band k for unit i; continuous x[i][k] is the disaggregated output in band k.
    y = [
        [pulp.LpVariable(f"y_{i}_{k}", cat=pulp.LpBinary) for k in range(n_bands)]
        for i in range(n_units)
    ]
    x = [
        [
            pulp.LpVariable(f"x_{i}_{k}", lowBound=0, upBound=float(band_ubs[i][k]))
            for k in range(n_bands)
        ]
        for i in range(n_units)
    ]

    # Each unit selects exactly one band, and x[i][k] is restricted to [lb, ub] of the active band (0 otherwise).
    for i in range(n_units):
        prob += pulp.lpSum(y[i]) == 1
        for k in range(n_bands):
            prob += x[i][k] >= band_lbs[i][k] * y[i][k]
            prob += x[i][k] <= band_ubs[i][k] * y[i][k]

    # Total output across all units and bands must meet demand; objective minimizes fixed + variable costs.
    prob += pulp.lpSum(x[i][k] for i in range(n_units) for k in range(n_bands)) >= demand
    prob += pulp.lpSum(
        fixed_costs[i][k] * y[i][k] + unit_costs[i][k] * x[i][k]
        for i in range(n_units)
        for k in range(n_bands)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Pick the active band via argmax to handle solver tolerances; sum disaggregated x[i][k] for total unit output.
    return {
        "modes": [max(range(n_bands), key=lambda k: pulp.value(y[i][k])) for i in range(n_units)],
        "outputs": [sum(float(pulp.value(x[i][k])) for k in range(n_bands)) for i in range(n_units)],
        "total_cost": float(pulp.value(prob.objective)),
    }
