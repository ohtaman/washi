import pulp


def solve(demand, band_lbs, band_ubs, fixed_costs, unit_costs) -> dict:
    """Return {"modes": list[int], "outputs": list[float], "total_cost": float}."""
    n_units = len(band_lbs)
    n_bands = len(band_lbs[0])

    prob = pulp.LpProblem("disjunctive_convex_hull", pulp.LpMinimize)

    # TODO: Build and solve the piecewise operating-band MIP, then return the output.
    raise NotImplementedError("Not implemented")
