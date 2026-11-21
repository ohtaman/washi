import pulp


def solve(
    baseline,
    unavailable,
    demands,
    maxShifts,
    workerCosts,
    disruptionWeight,
) -> dict:
    """Return {"schedule": list[list[int]], "hammingDistance": int, "totalObjective": float}."""
    max_shifts = maxShifts
    worker_costs = workerCosts
    disruption_weight = disruptionWeight
    m_workers = len(baseline)
    n_slots = len(demands)

    prob = pulp.LpProblem("min_disruption_rescheduling", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{t}", cat=pulp.LpBinary) for t in range(n_slots)]
        for i in range(m_workers)
    ]

    for i in range(m_workers):
        for t in range(n_slots):
            if unavailable[i][t] == 1:
                prob += x[i][t] == 0
        prob += pulp.lpSum(x[i]) <= max_shifts[i]

    for t in range(n_slots):
        prob += pulp.lpSum(x[i][t] for i in range(m_workers)) == demands[t]

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
    prob += disruption_weight * hamming_expr + assign_expr
    prob.solve(pulp.HiGHS(msg=False))

    schedule = [[round(pulp.value(x[i][t])) for t in range(n_slots)] for i in range(m_workers)]
    hamming_dist = sum(
        abs(schedule[i][t] - baseline[i][t])
        for i in range(m_workers)
        for t in range(n_slots)
    )
    return {
        "schedule": schedule,
        "hammingDistance": int(hamming_dist),
        "totalObjective": float(pulp.value(prob.objective)),
    }
