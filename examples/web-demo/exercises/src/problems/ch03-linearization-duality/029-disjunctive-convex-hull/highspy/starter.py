import pulp


def solve(input_data: dict) -> dict:
    """Return {"modes": list[int], "outputs": list[float], "totalCost": float}."""
    demand = input_data["demand"]
    band_lbs = input_data["bandLbs"]
    band_ubs = input_data["bandUbs"]
    fixed_costs = input_data["fixedCosts"]
    unit_costs = input_data["unitCosts"]
    n_units = len(band_lbs)
    n_bands = len(band_lbs[0])

    prob = pulp.LpProblem("disjunctive_convex_hull", pulp.LpMinimize)

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

    # TODO:
    # 1. Enforce exactly one band per unit: sum_k y[i][k] == 1
    # 2. Enforce disaggregated bounds: band_lbs[i][k] * y[i][k] <= x[i][k] <= band_ubs[i][k] * y[i][k]
    # 3. Enforce sum_{i,k} x[i][k] >= demand
    # 4. Minimize total fixed + linear band costs, solve, and return {"modes": ..., "outputs": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
