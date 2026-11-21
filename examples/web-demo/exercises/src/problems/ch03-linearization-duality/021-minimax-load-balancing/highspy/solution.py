import pulp


def solve(weights, compatible) -> dict:
    """Return {"assignments": list[list[float]], "peakLoad": float}."""
    n_jobs = len(weights)
    n_servers = len(compatible[0])

    prob = pulp.LpProblem("minimax_load_balancing", pulp.LpMinimize)

    assignments = [
        [
            pulp.LpVariable(f"x_{i}_{j}", lowBound=0, upBound=float(compatible[i][j]))
            for j in range(n_servers)
        ]
        for i in range(n_jobs)
    ]
    peak = pulp.LpVariable("peak", lowBound=0)

    for i in range(n_jobs):
        prob += pulp.lpSum(assignments[i]) == 1
    for j in range(n_servers):
        prob += pulp.lpSum(weights[i] * assignments[i][j] for i in range(n_jobs)) <= peak

    prob += peak
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "assignments": [[float(pulp.value(v)) for v in row] for row in assignments],
        "peakLoad": float(pulp.value(peak)),
    }
