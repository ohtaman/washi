import pulp


def solve(weights, compatible) -> dict:
    """Return {"assignments": list[list[float]], "peak_load": float}."""
    n_jobs = len(weights)
    n_servers = len(compatible[0])

    prob = pulp.LpProblem("minimax_load_balancing", pulp.LpMinimize)

    # Decision variables: fractional job-to-server assignments[i][j] in [0, compatible[i][j]]
    # (upBound=0 disables incompatible pairs) and auxiliary epigraph variable peak >= 0.
    assignments = [
        [
            pulp.LpVariable(f"x_{i}_{j}", lowBound=0, upBound=float(compatible[i][j]))
            for j in range(n_servers)
        ]
        for i in range(n_jobs)
    ]
    peak = pulp.LpVariable("peak", lowBound=0)

    # Each job must be fully assigned; peak bounds the weighted load on every server j.
    for i in range(n_jobs):
        prob += pulp.lpSum(assignments[i]) == 1
    for j in range(n_servers):
        prob += pulp.lpSum(weights[i] * assignments[i][j] for i in range(n_jobs)) <= peak

    # Objective: minimize the maximum server load.
    prob += peak
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "assignments": [[float(pulp.value(v)) for v in row] for row in assignments],
        "peak_load": float(pulp.value(peak)),
    }
