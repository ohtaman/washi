import pulp


def solve(dist, earliest, latest, service, maxVehicles) -> dict:
    """Return {"routes": list[list[int]], "totalCost": float}."""
    max_v = maxVehicles
    n = len(dist)

    prob = pulp.LpProblem("vrptw", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    t = [
        pulp.LpVariable(f"t_{i}", lowBound=earliest[i], upBound=latest[i], cat=pulp.LpContinuous)
        for i in range(n)
    ]
    max_cust = max(1, n - 1)
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=1, upBound=max_cust, cat=pulp.LpContinuous)
        if i >= 1
        else None
        for i in range(n)
    ]

    prob += t[0] == earliest[0]
    for i in range(1, n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1

    prob += pulp.lpSum(x[0][j] for j in range(1, n)) <= max_v
    prob += pulp.lpSum(x[0][j] for j in range(1, n)) == pulp.lpSum(x[i][0] for i in range(1, n))

    for j in range(1, n):
        m0j = max(0, earliest[0] + service[0] + dist[0][j] - earliest[j])
        prob += t[0] + service[0] + dist[0][j] - t[j] <= m0j * (1 - x[0][j])

    for i in range(1, n):
        mi0 = max(0, latest[i] + service[i] + dist[i][0] - latest[0])
        prob += t[i] + service[i] + dist[i][0] <= latest[0] + mi0 * (1 - x[i][0])
        for j in range(1, n):
            if i != j:
                mij = max(0, latest[i] + service[i] + dist[i][j] - earliest[j])
                prob += t[i] + service[i] + dist[i][j] - t[j] <= mij * (1 - x[i][j])
                prob += u[i] + 1 - u[j] <= max_cust * (1 - x[i][j])

    prob += pulp.lpSum(dist[i][j] * x[i][j] for i in range(n) for j in range(n) if i != j)
    prob.solve(pulp.HiGHS(msg=False))

    routes = []
    for j in range(1, n):
        if round(pulp.value(x[0][j])) == 1:
            route = [0, j]
            cur = j
            while cur != 0:
                nxt = next(k for k in range(n) if k != cur and round(pulp.value(x[cur][k])) == 1)
                route.append(nxt)
                cur = nxt
            routes.append(route)

    return {
        "routes": routes,
        "totalCost": float(pulp.value(prob.objective)),
    }
