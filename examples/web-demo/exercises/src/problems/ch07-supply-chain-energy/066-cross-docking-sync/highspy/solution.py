import pulp


def solve(
    supplies,
    demands,
    arrival_times,
    due_times,
    in_door_caps,
    out_door_caps,
    handling_costs,
    transfer_times,
    delay_cost,
) -> dict:
    """Return {"inDoor": list[int], "outDoor": list[int], "flows": list[list[list[float]]], "departures": list[float], "totalCost": float}."""
    arrivals = arrival_times
    dues = due_times
    in_caps = in_door_caps
    out_caps = out_door_caps

    n_in = len(supplies)
    n_out = len(demands)
    n_comms = len(supplies[0]) if n_in > 0 else 0
    R = len(in_caps)
    S = len(out_caps)

    prob = pulp.LpProblem("cross_docking_sync", pulp.LpMinimize)

    x = [[pulp.LpVariable(f"x_{i}_{r}", cat=pulp.LpBinary) for r in range(R)] for i in range(n_in)]
    y = [[pulp.LpVariable(f"y_{j}_{s}", cat=pulp.LpBinary) for s in range(S)] for j in range(n_out)]
    z = [[pulp.LpVariable(f"z_{i}_{j}", cat=pulp.LpBinary) for j in range(n_out)] for i in range(n_in)]
    f = [
        [[pulp.LpVariable(f"f_{i}_{j}_{k}", lowBound=0) for k in range(n_comms)] for j in range(n_out)]
        for i in range(n_in)
    ]
    w = [
        [
            [[pulp.LpVariable(f"w_{i}_{j}_{r}_{s}", lowBound=0) for s in range(S)] for r in range(R)]
            for j in range(n_out)
        ]
        for i in range(n_in)
    ]
    dep = [pulp.LpVariable(f"dep_{j}", lowBound=0) for j in range(n_out)]
    tard = [pulp.LpVariable(f"tard_{j}", lowBound=0) for j in range(n_out)]

    for i in range(n_in):
        prob += pulp.lpSum(x[i]) == 1
    for r in range(R):
        prob += pulp.lpSum(x[i][r] for i in range(n_in)) <= in_caps[r]
    for j in range(n_out):
        prob += pulp.lpSum(y[j]) == 1
    for s in range(S):
        prob += pulp.lpSum(y[j][s] for j in range(n_out)) <= out_caps[s]

    for k in range(n_comms):
        for i in range(n_in):
            prob += pulp.lpSum(f[i][j][k] for j in range(n_out)) <= supplies[i][k]
        for j in range(n_out):
            prob += pulp.lpSum(f[i][j][k] for i in range(n_in)) == demands[j][k]

    big_m_t = max(arrivals) + max(max(row) for row in transfer_times)

    for i in range(n_in):
        for j in range(n_out):
            m_ij = sum(min(supplies[i][k], demands[j][k]) for k in range(n_comms))
            pair_flow = pulp.lpSum(f[i][j])
            prob += pair_flow <= m_ij * z[i][j]
            prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
            for r in range(R):
                prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
            for s in range(S):
                prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
            for r in range(R):
                for s in range(S):
                    prob += dep[j] >= arrivals[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])

    for j in range(n_out):
        prob += tard[j] >= dep[j] - dues[j]

    prob += pulp.lpSum(
        handling_costs[r][s] * w[i][j][r][s]
        for i in range(n_in)
        for j in range(n_out)
        for r in range(R)
        for s in range(S)
    ) + delay_cost * pulp.lpSum(tard)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "inDoor": [next(r for r in range(R) if round(pulp.value(x[i][r])) == 1) for i in range(n_in)],
        "outDoor": [next(s for s in range(S) if round(pulp.value(y[j][s])) == 1) for j in range(n_out)],
        "flows": [[[float(pulp.value(f[i][j][k])) for k in range(n_comms)] for j in range(n_out)] for i in range(n_in)],
        "departures": [float(pulp.value(v)) for v in dep],
        "totalCost": float(pulp.value(prob.objective)),
    }
