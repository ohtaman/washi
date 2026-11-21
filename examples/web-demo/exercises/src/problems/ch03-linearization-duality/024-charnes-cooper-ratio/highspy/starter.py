import pulp


def solve(
    num_coeffs,
    num_const,
    den_coeffs,
    den_const,
    usages,
    capacities,
    upper_bounds,
) -> dict:
    """Return {"x": list[float], "maxRatio": float}."""
    num_c = num_coeffs
    num_0 = num_const
    den_c = den_coeffs
    den_0 = den_const
    caps = capacities
    ubs = upper_bounds
    n = len(num_c)

    prob = pulp.LpProblem("charnes_cooper_ratio", pulp.LpMaximize)

    # TODO: Formulate the Charnes-Cooper LP, maximize the linearized ratio, and recover x and maxRatio.
    raise NotImplementedError("Not implemented")
