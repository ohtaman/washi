import pulp


def solve(
    demands,
    p_min,
    p_max,
    ramp_limit,
    min_up,
    min_down,
    startup_costs,
    fuel_costs,
) -> dict:
    """Return {"commitment": list[list[int]], "generation": list[list[float]], "total_cost": float}."""
    ramp = ramp_limit
    G = len(p_min)
    T = len(demands)

    prob = pulp.LpProblem("unit_commitment", pulp.LpMinimize)

    # u[g][t]: commitment (binary), v[g][t]: startup (binary)
    # w[g][t]: shutdown in [0, 1] (integrality is implied by v - w = u_t - u_{t-1} and clique cuts)
    # p[g][t]: power generation of unit g in period t (in [0, p_max[g]])
    u = [[pulp.LpVariable(f"u_{g}_{t}", cat=pulp.LpBinary) for t in range(T)] for g in range(G)]
    v = [[pulp.LpVariable(f"v_{g}_{t}", cat=pulp.LpBinary) for t in range(T)] for g in range(G)]
    w = [[pulp.LpVariable(f"w_{g}_{t}", lowBound=0, upBound=1) for t in range(T)] for g in range(G)]
    p = [[pulp.LpVariable(f"p_{g}_{t}", lowBound=0, upBound=p_max[g]) for t in range(T)] for g in range(G)]

    # Hourly power balance
    for t in range(T):
        prob += pulp.lpSum(p[g][t] for g in range(G)) == demands[t]

    for g in range(G):
        # Startup/shutdown capability allows ramping to/from max(p_min, ramp)
        start_cap = max(p_min[g], ramp[g])
        for t in range(T):
            # Generation bounds when unit is on
            prob += p[g][t] >= p_min[g] * u[g][t]
            prob += p[g][t] <= p_max[g] * u[g][t]
            # Startup/shutdown state transition (units initially off)
            prev_u = 0 if t == 0 else u[g][t - 1]
            prob += v[g][t] - w[g][t] == u[g][t] - prev_u

            # Minimum up-time and minimum down-time clique inequalities
            up_start = max(0, t - min_up[g] + 1)
            prob += pulp.lpSum(v[g][up_start : t + 1]) <= u[g][t]

            down_start = max(0, t - min_down[g] + 1)
            prob += pulp.lpSum(w[g][down_start : t + 1]) <= 1 - u[g][t]

            # Ramp-up and ramp-down limits with startup/shutdown capability
            if t == 0:
                prob += p[g][0] <= start_cap
            else:
                prob += p[g][t] - p[g][t - 1] <= ramp[g] * u[g][t - 1] + start_cap * (1 - u[g][t - 1])
                prob += p[g][t - 1] - p[g][t] <= ramp[g] * u[g][t] + start_cap * (1 - u[g][t])

    # Objective: minimize total startup and fuel costs
    prob += pulp.lpSum(
        startup_costs[g] * v[g][t] + fuel_costs[g] * p[g][t]
        for g in range(G)
        for t in range(T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        # Round binary commitment flags to eliminate floating-point tolerance noise
        "commitment": [[round(pulp.value(val)) for val in row] for row in u],
        "generation": [[float(pulp.value(val)) for val in row] for row in p],
        "total_cost": float(pulp.value(prob.objective)),
    }
