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

    prob += pulp.lpDot(den_c, y) + den_0 * t == 1
    for k, cap in enumerate(caps):
        prob += pulp.lpDot(usages[k], y) <= cap * t
    for j, ub in enumerate(ubs):
        prob += y[j] <= ub * t

    prob += pulp.lpDot(num_c, y) + num_0 * t
    prob.solve(pulp.HiGHS(msg=False))

    t_val = float(pulp.value(t))
    return {
        "x": [float(pulp.value(v)) / t_val for v in y],
        "maxRatio": float(pulp.value(prob.objective)),
    }
