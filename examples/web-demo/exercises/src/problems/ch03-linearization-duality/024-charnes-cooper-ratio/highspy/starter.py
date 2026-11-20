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

    y = [pulp.LpVariable(f"y_{j}", lowBound=0) for j in range(n)]
    t = pulp.LpVariable("t", lowBound=0)

    # TODO:
    # 1. Add normalization: lpDot(den_c, y) + den_0 * t == 1
    # 2. Homogenize resource limits and variable upper bounds with factor t
    # 3. Maximize lpDot(num_c, y) + num_0 * t, solve, and recover x[j] = y[j] / t
    raise NotImplementedError("Not implemented")
