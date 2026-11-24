import pulp


def solve(release_dates, processing_times, due_dates, weights) -> dict:
    """Return {"starts": list[float], "total_weighted_tardiness": float}."""
    r = release_dates
    p = processing_times
    d = due_dates
    w = weights
    n = len(p)
    # Tight scheduling horizon (valid latest completion bound) used as big-M
    horizon = max(r) + sum(p)
    big_m = horizon

    prob = pulp.LpProblem("machine_tardiness", pulp.LpMinimize)
    # starts[j] in [r_j, horizon - p_j]; tardiness[j] >= 0
    starts = [
        pulp.LpVariable(f"s_{j}", lowBound=r[j], upBound=horizon - p[j])
        for j in range(n)
    ]
    tardiness = [pulp.LpVariable(f"T_{j}", lowBound=0) for j in range(n)]

    # Tardiness definition: T_j >= s_j + p_j - d_j
    for j in range(n):
        prob += tardiness[j] >= starts[j] + p[j] - d[j]

    # Disjunctive non-overlap constraints: binary y_{i,j} = 1 if job i precedes job j
    for i in range(n):
        for j in range(i + 1, n):
            y = pulp.LpVariable(f"y_{i}_{j}", cat=pulp.LpBinary)
            prob += starts[i] + p[i] <= starts[j] + big_m * (1 - y)
            prob += starts[j] + p[j] <= starts[i] + big_m * y

    # Objective: minimize total weighted tardiness
    prob += pulp.lpDot(w, tardiness)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "starts": [float(pulp.value(v)) for v in starts],
        "total_weighted_tardiness": float(pulp.value(prob.objective)),
    }
