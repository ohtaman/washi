import pulp


def solve(
    numCoeffs,
    numConst,
    denCoeffs,
    denConst,
    usages,
    capacities,
    upperBounds,
) -> dict:
    """Return {"x": list[float], "maxRatio": float}."""
    num_c = numCoeffs
    num_0 = numConst
    den_c = denCoeffs
    den_0 = denConst
    caps = capacities
    ubs = upperBounds
    n = len(num_c)

    prob = pulp.LpProblem("charnes_cooper_ratio", pulp.LpMaximize)

    # TODO: Formulate the Charnes-Cooper LP, maximize the linearized ratio, and recover x and maxRatio.
    raise NotImplementedError("Not implemented")
