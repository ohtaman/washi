import pulp


def solve(releaseDates, processingTimes, dueDates, weights) -> dict:
    """Return {"starts": list[float], "totalWeightedTardiness": float}."""
    r = releaseDates
    p = processingTimes
    d = dueDates
    w = weights
    n = len(p)
    horizon = max(r) + sum(p)
    big_m = horizon

    prob = pulp.LpProblem("machine_tardiness", pulp.LpMinimize)
    starts = [
        pulp.LpVariable(f"s_{j}", lowBound=r[j], upBound=horizon - p[j])
        for j in range(n)
    ]
    tardiness = [pulp.LpVariable(f"T_{j}", lowBound=0) for j in range(n)]

    for j in range(n):
        prob += tardiness[j] >= starts[j] + p[j] - d[j]

    for i in range(n):
        for j in range(i + 1, n):
            y = pulp.LpVariable(f"y_{i}_{j}", cat=pulp.LpBinary)
            prob += starts[i] + p[i] <= starts[j] + big_m * (1 - y)
            prob += starts[j] + p[j] <= starts[i] + big_m * y

    prob += pulp.lpDot(w, tardiness)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "starts": [float(pulp.value(v)) for v in starts],
        "totalWeightedTardiness": float(pulp.value(prob.objective)),
    }
