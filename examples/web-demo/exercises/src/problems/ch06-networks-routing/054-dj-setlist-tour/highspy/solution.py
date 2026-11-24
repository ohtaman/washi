import pulp


def solve(transitions) -> dict:
    """Return {"setlist": list[int], "total_cost": float}."""
    n = len(transitions)

    prob = pulp.LpProblem("dj_setlist_tour", pulp.LpMinimize)
    # x[i][j] in {0, 1}: binary indicator for transitioning from track i to track j (i != j)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    # u[i] in [1, n-1]: continuous MTZ position variable for track i > 0
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=1, upBound=n - 1, cat=pulp.LpContinuous)
        if i > 0
        else None
        for i in range(n)
    ]

    # Degree constraints: every track has exactly one outgoing and one incoming transition
    for i in range(n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1

    # Miller-Tucker-Zemlin (MTZ) subtour elimination: x[i][j] == 1 => u[j] >= u[i] + 1
    for i in range(1, n):
        for j in range(1, n):
            if i != j:
                prob += u[i] - u[j] + n * x[i][j] <= n - 1

    # Minimize total transition cost across the Hamiltonian tour
    prob += pulp.lpSum(
        transitions[i][j] * x[i][j] for i in range(n) for j in range(n) if i != j
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Reconstruct tour order starting from track 0
    setlist = [0]
    cur = 0
    for _ in range(1, n):
        nxt = next(j for j in range(n) if j != cur and round(pulp.value(x[cur][j])) == 1)
        setlist.append(nxt)
        cur = nxt

    return {
        "setlist": setlist,
        "total_cost": float(pulp.value(prob.objective)),
    }
