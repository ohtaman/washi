import pulp


def solve(input_data: dict) -> dict:
    """Return {"setlist": list[int], "totalCost": float}."""
    transitions = input_data["transitions"]
    n = len(transitions)

    prob = pulp.LpProblem("dj_setlist_tour", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=1, upBound=n - 1, cat=pulp.LpContinuous)
        if i > 0
        else None
        for i in range(n)
    ]

    for i in range(n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1

    for i in range(1, n):
        for j in range(1, n):
            if i != j:
                prob += u[i] - u[j] + n * x[i][j] <= n - 1

    prob += pulp.lpSum(
        transitions[i][j] * x[i][j] for i in range(n) for j in range(n) if i != j
    )
    prob.solve(pulp.HiGHS(msg=False))

    setlist = [0]
    cur = 0
    for _ in range(1, n):
        nxt = next(j for j in range(n) if j != cur and round(pulp.value(x[cur][j])) == 1)
        setlist.append(nxt)
        cur = nxt

    return {
        "setlist": setlist,
        "totalCost": float(pulp.value(prob.objective)),
    }
