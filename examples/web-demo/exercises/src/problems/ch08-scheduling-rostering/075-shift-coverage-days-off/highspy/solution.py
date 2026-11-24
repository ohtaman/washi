import pulp


def solve(demands, shift_costs, min_shifts, max_shifts, days_off) -> dict:
    """Return {"schedule": list[list[int]], "total_cost": float}."""
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = len(demands[0])

    prob = pulp.LpProblem("shift_coverage_days_off", pulp.LpMinimize)
    # x[i][d][s] = 1 if staff i works shift s on day d (binary)
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

    # Per-staff constraints: 0 shifts on days off, <= 1 shift per day, and [min_shifts, max_shifts] total
    for i in range(num_staff):
        off_set = set(days_off[i])
        for d in range(num_days):
            day_sum = pulp.lpSum(x[i][d])
            prob += day_sum == 0 if d in off_set else day_sum <= 1
        total_i = pulp.lpSum(x[i][d][s] for d in range(num_days) for s in range(num_shifts))
        prob += total_i >= min_shifts[i]
        prob += total_i <= max_shifts[i]

    # Daily shift coverage requirements
    for d in range(num_days):
        for s in range(num_shifts):
            prob += pulp.lpSum(x[i][d][s] for i in range(num_staff)) >= demands[d][s]

    # Objective: minimize total shift assignment costs
    prob += pulp.lpSum(
        shift_costs[i][s] * x[i][d][s]
        for i in range(num_staff)
        for d in range(num_days)
        for s in range(num_shifts)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Decode shift index per (staff, day), defaulting to -1 on days off (rounded for tolerance safety)
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
