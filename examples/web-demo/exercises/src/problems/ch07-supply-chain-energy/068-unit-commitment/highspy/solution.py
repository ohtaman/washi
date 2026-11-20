import pulp


def solve(input_data: dict) -> dict:
    """Return {"commitment": list[list[int]], "generation": list[list[float]], "totalCost": float}."""
    demands = input_data["demands"]
    p_min = input_data["pMin"]
    p_max = input_data["pMax"]
    ramp = input_data["rampLimit"]
    min_up = input_data["minUp"]
    min_down = input_data["minDown"]
    startup_costs = input_data["startupCosts"]
    fuel_costs = input_data["fuelCosts"]
    G = len(p_min)
    T = len(demands)

    prob = pulp.LpProblem("unit_commitment", pulp.LpMinimize)

    u = [[pulp.LpVariable(f"u_{g}_{t}", cat=pulp.LpBinary) for t in range(T)] for g in range(G)]
    v = [[pulp.LpVariable(f"v_{g}_{t}", cat=pulp.LpBinary) for t in range(T)] for g in range(G)]
    w = [[pulp.LpVariable(f"w_{g}_{t}", lowBound=0, upBound=1) for t in range(T)] for g in range(G)]
    p = [[pulp.LpVariable(f"p_{g}_{t}", lowBound=0, upBound=p_max[g]) for t in range(T)] for g in range(G)]

    for t in range(T):
        prob += pulp.lpSum(p[g][t] for g in range(G)) == demands[t]

    for g in range(G):
        start_cap = max(p_min[g], ramp[g])
        for t in range(T):
            prob += p[g][t] >= p_min[g] * u[g][t]
            prob += p[g][t] <= p_max[g] * u[g][t]
            prev_u = 0 if t == 0 else u[g][t - 1]
            prob += v[g][t] - w[g][t] == u[g][t] - prev_u

            up_start = max(0, t - min_up[g] + 1)
            prob += pulp.lpSum(v[g][up_start : t + 1]) <= u[g][t]

            down_start = max(0, t - min_down[g] + 1)
            prob += pulp.lpSum(w[g][down_start : t + 1]) <= 1 - u[g][t]

            if t == 0:
                prob += p[g][0] <= start_cap
            else:
                prob += p[g][t] - p[g][t - 1] <= ramp[g] * u[g][t - 1] + start_cap * (1 - u[g][t - 1])
                prob += p[g][t - 1] - p[g][t] <= ramp[g] * u[g][t] + start_cap * (1 - u[g][t])

    prob += pulp.lpSum(
        startup_costs[g] * v[g][t] + fuel_costs[g] * p[g][t]
        for g in range(G)
        for t in range(T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "commitment": [[round(pulp.value(val)) for val in row] for row in u],
        "generation": [[float(pulp.value(val)) for val in row] for row in p],
        "totalCost": float(pulp.value(prob.objective)),
    }
