import pulp


def solve(
    baseline,
    unavailable,
    demands,
    max_shifts,
    worker_costs,
    disruption_weight,
) -> dict:
    """Return {"schedule": list[list[int]], "hamming_distance": int, "total_objective": float}."""
    m_workers = len(baseline)
    n_slots = len(demands)

    prob = pulp.LpProblem("min_disruption_rescheduling", pulp.LpMinimize)
    # x[i][t] = 1 if worker i is assigned to slot t in the revised schedule
    x = [
        [pulp.LpVariable(f"x_{i}_{t}", cat=pulp.LpBinary) for t in range(n_slots)]
        for i in range(m_workers)
    ]

    # Worker unavailability and per-worker maximum shift limits
    for i in range(m_workers):
        for t in range(n_slots):
            if unavailable[i][t] == 1:
                prob += x[i][t] == 0
        prob += pulp.lpSum(x[i]) <= max_shifts[i]

    # Cover exact staffing demand in every slot
    for t in range(n_slots):
        prob += pulp.lpSum(x[i][t] for i in range(m_workers)) == demands[t]

    # Linearized Hamming distance |x[i][t] - baseline[i][t]| for binary variables
    hamming_expr = pulp.lpSum(
        (1 - baseline[i][t]) * x[i][t] + baseline[i][t] * (1 - x[i][t])
        for i in range(m_workers)
        for t in range(n_slots)
    )
    assign_expr = pulp.lpSum(
        worker_costs[i] * x[i][t]
        for i in range(m_workers)
        for t in range(n_slots)
    )
    # Minimize weighted schedule disruption plus assignment cost
    prob += disruption_weight * hamming_expr + assign_expr
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary values to clean 0/1 integers
    schedule = [[round(pulp.value(x[i][t])) for t in range(n_slots)] for i in range(m_workers)]
    hamming_dist = sum(
        abs(schedule[i][t] - baseline[i][t])
        for i in range(m_workers)
        for t in range(n_slots)
    )
    return {
        "schedule": schedule,
        "hamming_distance": int(hamming_dist),
        "total_objective": float(pulp.value(prob.objective)),
    }
