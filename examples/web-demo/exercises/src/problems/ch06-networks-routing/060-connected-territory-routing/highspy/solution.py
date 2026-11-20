import pulp


def solve(input_data: dict) -> dict:
    """Return {"territories": list[dict], "totalCost": float}."""
    num_t = input_data["numTerritories"]
    demands = input_data["demands"]
    min_d, max_d = input_data["demandBounds"]
    hub_costs = input_data["hubCosts"]
    adj_edges = input_data["adjEdges"]
    dist = input_data["dist"]
    n = len(demands)

    prob = pulp.LpProblem("connected_territory_routing", pulp.LpMinimize)
    y = [[pulp.LpVariable(f"y_{i}_{k}", cat=pulp.LpBinary) for k in range(num_t)] for i in range(n)]
    h = [[pulp.LpVariable(f"h_{i}_{k}", cat=pulp.LpBinary) for k in range(num_t)] for i in range(n)]
    s = [[pulp.LpVariable(f"s_{i}_{k}", lowBound=0, upBound=n) for k in range(num_t)] for i in range(n)]
    f = [
        [[pulp.LpVariable(f"f_{e}_{d}_{k}", lowBound=0, upBound=n - 1) for k in range(num_t)] for d in range(2)]
        for e in range(len(adj_edges))
    ]
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [pulp.LpVariable(f"u_{i}", lowBound=0, upBound=n - 1) for i in range(n)]

    for i in range(n):
        prob += pulp.lpSum(y[i][k] for k in range(num_t)) == 1
    for k in range(num_t):
        prob += pulp.lpSum(h[i][k] for i in range(n)) == 1
        prob += pulp.lpSum(demands[i] * y[i][k] for i in range(n)) >= min_d
        prob += pulp.lpSum(demands[i] * y[i][k] for i in range(n)) <= max_d
        for i in range(n):
            prob += h[i][k] <= y[i][k]
            prob += s[i][k] <= n * h[i][k]

    for k in range(num_t - 1):
        prob += pulp.lpSum(i * h[i][k] for i in range(n)) + 1 <= pulp.lpSum(
            i * h[i][k + 1] for i in range(n)
        )

    for e_idx, (eu, ev) in enumerate(adj_edges):
        for k in range(num_t):
            prob += f[e_idx][0][k] <= (n - 1) * y[eu][k]
            prob += f[e_idx][0][k] <= (n - 1) * y[ev][k]
            prob += f[e_idx][1][k] <= (n - 1) * y[eu][k]
            prob += f[e_idx][1][k] <= (n - 1) * y[ev][k]

    for i in range(n):
        for k in range(num_t):
            in_f = pulp.lpSum(
                f[e_idx][0][k] for e_idx, (_eu, ev) in enumerate(adj_edges) if ev == i
            ) + pulp.lpSum(
                f[e_idx][1][k] for e_idx, (eu, _ev) in enumerate(adj_edges) if eu == i
            )
            out_f = pulp.lpSum(
                f[e_idx][0][k] for e_idx, (eu, _ev) in enumerate(adj_edges) if eu == i
            ) + pulp.lpSum(
                f[e_idx][1][k] for e_idx, (_eu, ev) in enumerate(adj_edges) if ev == i
            )
            prob += s[i][k] + in_f - out_f == y[i][k]

    for i in range(n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1
        for j in range(n):
            if i != j:
                for k in range(num_t):
                    prob += y[i][k] - y[j][k] <= 1 - x[i][j]
                h_j = pulp.lpSum(h[j][k] for k in range(num_t))
                prob += u[i] + 1 - u[j] <= n * (1 - x[i][j] + h_j)

    prob += pulp.lpSum(hub_costs[i] * h[i][k] for i in range(n) for k in range(num_t)) + pulp.lpSum(
        dist[i][j] * x[i][j] for i in range(n) for j in range(n) if i != j
    )
    prob.solve(pulp.HiGHS(msg=False))

    territories = []
    for k in range(num_t):
        hub = next(i for i in range(n) if round(pulp.value(h[i][k])) == 1)
        tour = [hub]
        cur = hub
        while True:
            nxt = next(j for j in range(n) if j != cur and round(pulp.value(x[cur][j])) == 1)
            tour.append(nxt)
            if nxt == hub:
                break
            cur = nxt
        territories.append({"hub": hub, "tour": tour})

    return {
        "territories": territories,
        "totalCost": float(pulp.value(prob.objective)),
    }
