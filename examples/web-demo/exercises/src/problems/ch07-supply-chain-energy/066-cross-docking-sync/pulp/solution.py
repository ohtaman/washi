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
    """Return {"in_door": list[int], "out_door": list[int], "flows": list[list[list[float]]], "departures": list[float], "total_cost": float}."""
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

    # x[i][r], y[j][s]: binary door assignments for inbound truck i (door r) and outbound truck j (door s)
    # z[i][j]: binary indicator = 1 if any cargo flows from inbound i to outbound j
    # f[i][j][k]: commodity k flow from i to j (>= 0)
    # w[i][j][r][s]: total flow from i to j routed through door pair (r, s), linearizing door-pair handling costs
    # dep[j], tard[j]: outbound truck j departure time and tardiness beyond dues[j] (>= 0)
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

    # Each truck is assigned to one door; each door respects its truck capacity
    for i in range(n_in):
        prob += pulp.lpSum(x[i]) == 1
    for r in range(R):
        prob += pulp.lpSum(x[i][r] for i in range(n_in)) <= in_caps[r]
    for j in range(n_out):
        prob += pulp.lpSum(y[j]) == 1
    for s in range(S):
        prob += pulp.lpSum(y[j][s] for j in range(n_out)) <= out_caps[s]

    # Commodity supply limits and outbound demand satisfaction
    for k in range(n_comms):
        for i in range(n_in):
            prob += pulp.lpSum(f[i][j][k] for j in range(n_out)) <= supplies[i][k]
        for j in range(n_out):
            prob += pulp.lpSum(f[i][j][k] for i in range(n_in)) == demands[j][k]

    # Tight big-M for departure synchronization: max possible arrival + transfer time
    big_m_t = max(arrivals) + max(max(row) for row in transfer_times)

    for i in range(n_in):
        for j in range(n_out):
            # Tight upper bound on transferable flow between truck pair (i, j)
            m_ij = sum(min(supplies[i][k], demands[j][k]) for k in range(n_comms))
            pair_flow = pulp.lpSum(f[i][j])
            # Link transfer indicator z[i][j] and disaggregate flow into door-pair variables w[i][j][r][s]
            prob += pair_flow <= m_ij * z[i][j]
            prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
            for r in range(R):
                prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
            for s in range(S):
                prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
            # Big-M synchronization: active only when x[i][r] = y[j][s] = z[i][j] = 1
            for r in range(R):
                for s in range(S):
                    prob += dep[j] >= arrivals[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])

    # Tardiness beyond due time
    for j in range(n_out):
        prob += tard[j] >= dep[j] - dues[j]

    # Objective: minimize door-pair handling costs plus departure delay penalty
    prob += pulp.lpSum(
        handling_costs[r][s] * w[i][j][r][s]
        for i in range(n_in)
        for j in range(n_out)
        for r in range(R)
        for s in range(S)
    ) + delay_cost * pulp.lpSum(tard)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        # Round binary door flags to eliminate floating-point tolerance noise
        "in_door": [next(r for r in range(R) if round(pulp.value(x[i][r])) == 1) for i in range(n_in)],
        "out_door": [next(s for s in range(S) if round(pulp.value(y[j][s])) == 1) for j in range(n_out)],
        "flows": [[[float(pulp.value(f[i][j][k])) for k in range(n_comms)] for j in range(n_out)] for i in range(n_in)],
        "departures": [float(pulp.value(v)) for v in dep],
        "total_cost": float(pulp.value(prob.objective)),
    }
