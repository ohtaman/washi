import pulp


def solve(demand, bandLbs, bandUbs, fixedCosts, unitCosts) -> dict:
    """Return {"modes": list[int], "outputs": list[float], "totalCost": float}."""
    band_lbs = bandLbs
    band_ubs = bandUbs
    fixed_costs = fixedCosts
    unit_costs = unitCosts
    n_units = len(band_lbs)
    n_bands = len(band_lbs[0])

    prob = pulp.LpProblem("disjunctive_convex_hull", pulp.LpMinimize)

    # TODO: Build and solve the piecewise operating-band MIP, then return the output.
    raise NotImplementedError("Not implemented")
