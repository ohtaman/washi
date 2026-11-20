import pulp


def solve(input_data: dict) -> dict:
    """Return {"schedule": list[list[int]], "hammingDistance": int, "totalObjective": float}."""
    baseline = input_data["baseline"]
    unavailable = input_data["unavailable"]
    demands = input_data["demands"]
    max_shifts = input_data["maxShifts"]
    worker_costs = input_data["workerCosts"]
    disruption_weight = input_data["disruptionWeight"]
    m_workers = len(baseline)
    n_slots = len(demands)

    prob = pulp.LpProblem("min_disruption_rescheduling", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{t}", cat=pulp.LpBinary) for t in range(n_slots)]
        for i in range(m_workers)
    ]

    # TODO:
    # 1. Force x[i][t] == 0 whenever unavailable[i][t] == 1
    # 2. Enforce exact staffing demands[t] per slot and max_shifts[i] per worker
    # 3. Minimize disruption_weight * Hamming distance + worker_costs, solve with HiGHS,
    #    and return {"schedule": ..., "hammingDistance": ..., "totalObjective": ...}
    raise NotImplementedError("Not implemented")
