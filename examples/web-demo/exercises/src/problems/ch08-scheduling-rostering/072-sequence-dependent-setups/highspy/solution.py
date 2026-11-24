import pulp


def solve(processing_times, setup_matrix, due_dates) -> dict:
    """Return {"order": list[int], "completions": list[float], "total_tardiness": float}."""
    p = processing_times
    s = setup_matrix
    d = due_dates
    n = len(p)
    max_setup = max((max(row) for row in s), default=0)
    # Upper bound on completion times and big-M for sequence-dependent transition
    horizon = sum(p) + max(0, n - 1) * max_setup
    big_m = horizon + max_setup

    prob = pulp.LpProblem("sequence_dependent_setups", pulp.LpMinimize)
    # x[(i, j)] = 1 if job j immediately follows i (node n is dummy start/end depot)
    # completions[j] in [p_j, horizon]; tardiness[j] >= 0
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

    # Assignment degree constraints: each node (including dummy depot n) has 1 predecessor and 1 successor
    for i in range(n + 1):
        prob += pulp.lpSum(x[(i, j)] for j in range(n + 1) if j != i) == 1
        prob += pulp.lpSum(x[(j, i)] for j in range(n + 1) if j != i) == 1

    # MTZ-style big-M completion linking: enforces C_j >= C_i + s_{i,j} + p_j and breaks subtours
    for i in range(n):
        for j in range(n):
            if i != j:
                prob += (
                    completions[j]
                    >= completions[i] + s[i][j] + p[j] - big_m * (1 - x[(i, j)])
                )

    # Tardiness beyond due date
    for j in range(n):
        prob += tardiness[j] >= completions[j] - d[j]

    # Objective: minimize total tardiness
    prob += pulp.lpSum(tardiness)
    prob.solve(pulp.HiGHS(msg=False))

    # Reconstruct job order by following binary arcs from dummy depot n (rounded for tolerance safety)
    order = []
    cur = n
    for _ in range(n):
        cur = next(j for j in range(n + 1) if j != cur and round(pulp.value(x[(cur, j)])) == 1)
        order.append(cur)

    return {
        "order": order,
        "completions": [float(pulp.value(v)) for v in completions],
        "total_tardiness": float(pulp.value(prob.objective)),
    }
