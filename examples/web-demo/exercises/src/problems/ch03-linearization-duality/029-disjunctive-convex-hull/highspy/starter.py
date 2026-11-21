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

    # TODO: Build and solve the piecewise operating-band MIP, then return the output.
    raise NotImplementedError("Not implemented")
