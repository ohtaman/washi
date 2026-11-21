import pulp


def solve(input_data: dict) -> dict:
    """Return {"x": list[float], "maxRatio": float}."""
    num_c = input_data["numCoeffs"]
    num_0 = input_data["numConst"]
    den_c = input_data["denCoeffs"]
    den_0 = input_data["denConst"]
    usages = input_data["usages"]
    caps = input_data["capacities"]
    ubs = input_data["upperBounds"]
    n = len(num_c)

    prob = pulp.LpProblem("charnes_cooper_ratio", pulp.LpMaximize)

    # TODO: Formulate the Charnes-Cooper LP, maximize the linearized ratio, and recover x and maxRatio.
    raise NotImplementedError("Not implemented")
