import pulp


def solve(input_data: dict) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    dist = input_data["dist"]
    reqs = input_data["requests"]
    cap = input_data["capacity"]
    max_v = input_data["maxVehicles"]
    max_stops = input_data["maxStopsPerVehicle"]
    n = len(dist)

    prob = pulp.LpProblem("pickup_delivery", pulp.LpMinimize)
    x = [
        [
            [pulp.LpVariable(f"x_{i}_{j}_{k}", cat=pulp.LpBinary) if i != j else None for k in range(max_v)]
            for j in range(n)
        ]
        for i in range(n)
    ]
    t = [
        pulp.LpVariable(
            f"t_{i}",
            lowBound=0 if i == 0 else 1,
            upBound=0 if i == 0 else n - 1,
            cat=pulp.LpContinuous,
        )
        for i in range(n)
    ]

    delta = [0] * n
    for r in reqs:
        delta[r["pickup"]] = r["demand"]
        delta[r["delivery"]] = -r["demand"]

    load = [
        pulp.LpVariable(
            f"L_{i}",
            lowBound=0 if i == 0 else max(0, delta[i]),
            upBound=0 if i == 0 else min(cap, cap + delta[i]),
            cat=pulp.LpContinuous,
        )
        for i in range(n)
    ]

    for i in range(1, n):
        prob += pulp.lpSum(x[i][j][k] for k in range(max_v) for j in range(n) if j != i) == 1

    for k in range(max_v):
        prob += pulp.lpSum(x[0][j][k] for j in range(1, n)) <= 1
        prob += pulp.lpSum(x[0][j][k] for j in range(1, n)) == pulp.lpSum(
            x[i][0][k] for i in range(1, n)
        )
        prob += (
            pulp.lpSum(x[i][j][k] for i in range(1, n) for j in range(n) if j != i)
            <= max_stops
        )
        for i in range(1, n):
            prob += pulp.lpSum(x[j][i][k] for j in range(n) if j != i) == pulp.lpSum(
                x[i][j][k] for j in range(n) if j != i
            )

    for r in reqs:
        p, d = r["pickup"], r["delivery"]
        for k in range(max_v):
            prob += pulp.lpSum(x[p][j][k] for j in range(n) if j != p) == pulp.lpSum(
                x[d][j][k] for j in range(n) if j != d
            )
        prob += t[p] + 1 <= t[d]

    for i in range(n):
        for j in range(1, n):
            if i != j:
                y_ij = pulp.lpSum(x[i][j][k] for k in range(max_v))
                if i > 0:
                    prob += t[i] + 1 - t[j] <= n * (1 - y_ij)
                m_load = cap + max(0, delta[j])
                prob += load[i] + delta[j] - load[j] <= m_load * (1 - y_ij)

    prob += pulp.lpSum(
        dist[i][j] * x[i][j][k]
        for k in range(max_v)
        for i in range(n)
        for j in range(n)
        if i != j
    )
    prob.solve(pulp.HiGHS(msg=False))

    routes = []
    for k in range(max_v):
        starts = [j for j in range(1, n) if round(pulp.value(x[0][j][k])) == 1]
        if not starts:
            continue
        cur = starts[0]
        route = [0, cur]
        while cur != 0:
            nxt = next(j for j in range(n) if j != cur and round(pulp.value(x[cur][j][k])) == 1)
            route.append(nxt)
            cur = nxt
        routes.append(route)

    return {
        "routes": routes,
        "totalDistance": float(pulp.value(prob.objective)),
    }
