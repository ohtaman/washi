import pulp


def solve(dist, demands, capacity, maxVehicles) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    cap = capacity
    max_v = maxVehicles
    n = len(dist)

    prob = pulp.LpProblem("cvrp_routing", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=demands[i], upBound=cap, cat=pulp.LpContinuous)
        if i > 0
        else None
        for i in range(n)
    ]

    for i in range(1, n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1

    prob += pulp.lpSum(x[0][j] for j in range(1, n)) <= max_v
    prob += pulp.lpSum(x[0][j] for j in range(1, n)) == pulp.lpSum(x[i][0] for i in range(1, n))

    for i in range(1, n):
        for j in range(1, n):
            if i != j:
                prob += u[i] - u[j] + cap * x[i][j] <= cap - demands[j]

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
        "totalDistance": float(pulp.value(prob.objective)),
    }
