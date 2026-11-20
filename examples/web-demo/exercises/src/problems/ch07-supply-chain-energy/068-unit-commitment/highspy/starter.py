import pulp


def solve(input_data: dict) -> dict:
    """Return {"commitment": list[list[int]], "generation": list[list[float]], "totalCost": float}."""
    prob = pulp.LpProblem("unit_commitment", pulp.LpMinimize)

    # TODO:
    # 1. Declare commitment u[g][t], startup v[g][t], shutdown w[g][t], and generation p[g][t]
    # 2. Enforce power balance, generation [pMin*u, pMax*u], min-up/min-down, and ramp constraints
    # 3. Minimize startup + fuel cost, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
