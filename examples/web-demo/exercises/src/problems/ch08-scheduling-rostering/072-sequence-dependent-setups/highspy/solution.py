import pulp


def solve(processing_times, setup_matrix, due_dates) -> dict:
    """Return {"order": list[int], "completions": list[float], "totalTardiness": float}."""
    p = processing_times
    s = setup_matrix
    d = due_dates
    n = len(p)
    max_setup = max((max(row) for row in s), default=0)
    horizon = sum(p) + max(0, n - 1) * max_setup
    big_m = horizon + max_setup

    prob = pulp.LpProblem("sequence_dependent_setups", pulp.LpMinimize)
    x = {
        (i, j): pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary)
        for i in range(n + 1)
        for j in range(n + 1)
        if i != j
    }
    completions = [
        pulp.LpVariable(f"C_{j}", lowBound=p[j], upBound=horizon) for j in range(n)
    ]
    tardiness = [pulp.LpVariable(f"T_{j}", lowBound=0) for j in range(n)]

    for i in range(n + 1):
        prob += pulp.lpSum(x[(i, j)] for j in range(n + 1) if j != i) == 1
        prob += pulp.lpSum(x[(j, i)] for j in range(n + 1) if j != i) == 1

    for i in range(n):
        for j in range(n):
            if i != j:
                prob += (
                    completions[j]
                    >= completions[i] + s[i][j] + p[j] - big_m * (1 - x[(i, j)])
                )

    for j in range(n):
        prob += tardiness[j] >= completions[j] - d[j]

    prob += pulp.lpSum(tardiness)
    prob.solve(pulp.HiGHS(msg=False))

    order = []
    cur = n
    for _ in range(n):
        cur = next(j for j in range(n + 1) if j != cur and round(pulp.value(x[(cur, j)])) == 1)
        order.append(cur)

    return {
        "order": order,
        "completions": [float(pulp.value(v)) for v in completions],
        "totalTardiness": float(pulp.value(prob.objective)),
    }
