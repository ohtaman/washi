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
    """Return {"x": list[float], "max_ratio": float}."""
    num_c = num_coeffs
    num_0 = num_const
    den_c = den_coeffs
    den_0 = den_const
    caps = capacities
    ubs = upper_bounds
    n = len(num_c)

    prob = pulp.LpProblem("charnes_cooper_ratio", pulp.LpMaximize)

    # Charnes-Cooper transformation: introduce t = 1 / (den_c^T x + den_0) >= 0 and y = t * x >= 0
    # to convert the linear-fractional program into an equivalent LP.
    y = [pulp.LpVariable(f"y_{j}", lowBound=0) for j in range(n)]
    t = pulp.LpVariable("t", lowBound=0)

    # Normalization constraint fixing the scaled denominator to 1, plus homogenized resource/bound constraints.
    prob += pulp.lpDot(den_c, y) + den_0 * t == 1
    for k, cap in enumerate(caps):
        prob += pulp.lpDot(usages[k], y) <= cap * t
    for j, ub in enumerate(ubs):
        prob += y[j] <= ub * t

    # Objective: maximize the homogenized numerator, which equals the original ratio.
    prob += pulp.lpDot(num_c, y) + num_0 * t
    prob.solve(pulp.HiGHS(msg=False))

    # Recover original decision variables via x = y / t.
    t_val = float(pulp.value(t))
    return {
        "x": [float(pulp.value(v)) / t_val for v in y],
        "max_ratio": float(pulp.value(prob.objective)),
    }
