import pulp


def solve(demands, shift_costs, max_consecutive_days) -> dict:
    """Return {"schedule": list[list[int]], "total_cost": float}."""
    max_consec = max_consecutive_days
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = 3

    prob = pulp.LpProblem("consecutive_night_rest", pulp.LpMinimize)
    x = [
        [
            [
                pulp.LpVariable(f"x_{i}_{d}_{s}", cat=pulp.LpBinary)
                for s in range(num_shifts)
            ]
            for d in range(num_days)
        ]
        for i in range(num_staff)
    ]

    for i in range(num_staff):
        for d in range(num_days):
            prob += pulp.lpSum(x[i][d]) <= 1
        for t in range(num_days - max_consec):
            prob += (
                pulp.lpSum(
                    x[i][tau][s]
                    for tau in range(t, t + max_consec + 1)
                    for s in range(num_shifts)
                )
                <= max_consec
            )
        for d in range(num_days - 1):
            prob += x[i][d][2] + x[i][d + 1][0] <= 1

    for d in range(num_days):
        for s in range(num_shifts):
            prob += pulp.lpSum(x[i][d][s] for i in range(num_staff)) >= demands[d][s]

    prob += pulp.lpSum(
        shift_costs[i][s] * x[i][d][s]
        for i in range(num_staff)
        for d in range(num_days)
        for s in range(num_shifts)
    )
    prob.solve(pulp.HiGHS(msg=False))

    schedule = [
        [
            next((s for s in range(num_shifts) if round(pulp.value(x[i][d][s])) == 1), -1)
            for d in range(num_days)
        ]
        for i in range(num_staff)
    ]

    return {
        "schedule": schedule,
        "total_cost": float(pulp.value(prob.objective)),
    }
