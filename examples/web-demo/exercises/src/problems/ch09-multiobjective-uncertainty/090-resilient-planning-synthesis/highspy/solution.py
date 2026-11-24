import pulp


def solve(
    fixed_costs,
    capacities,
    drop_amounts,
    gamma,
    robust_min_cap,
    probs,
    demands,
    offline,
    disruption_cost,
    shortfall_penalty,
) -> dict:
    """Return {"committed": list[int], "recovered": list[list[int]], "total_cost": float}."""
    shortfall_pen = shortfall_penalty
    n = len(fixed_costs)
    S = len(probs)

    prob = pulp.LpProblem("resilient_planning_synthesis", pulp.LpMinimize)
    y = [pulp.LpVariable(f"y_{j}", cat=pulp.LpBinary) for j in range(n)]
    z = pulp.LpVariable("z", lowBound=0)
    p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]
    w = [[pulp.LpVariable(f"w_{s}_{j}", cat=pulp.LpBinary) for j in range(n)] for s in range(S)]
    diff = [[pulp.LpVariable(f"d_{s}_{j}", lowBound=0, upBound=1) for j in range(n)] for s in range(S)]
    shortfall = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]

    prob += pulp.lpDot(capacities, y) - gamma * z - pulp.lpSum(p) >= robust_min_cap
    for j in range(n):
        prob += z + p[j] >= drop_amounts[j] * y[j]

    for s in range(S):
        for j in range(n):
            if offline[s][j] == 1:
                prob += w[s][j] == 0
            prob += diff[s][j] >= w[s][j] - y[j]
            prob += diff[s][j] >= y[j] - w[s][j]
        prob += pulp.lpDot(capacities, w[s]) + shortfall[s] >= demands[s]

    stage2_expected = pulp.lpSum(
        probs[s] * (disruption_cost * pulp.lpSum(diff[s]) + shortfall_pen * shortfall[s])
        for s in range(S)
    )
    prob += pulp.lpDot(fixed_costs, y) + stage2_expected
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "committed": [round(pulp.value(v)) for v in y],
        "recovered": [[round(pulp.value(v)) for v in row] for row in w],
        "total_cost": float(pulp.value(prob.objective)),
    }
