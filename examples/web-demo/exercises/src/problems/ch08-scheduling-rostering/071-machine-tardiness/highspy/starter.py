import pulp


def solve(input_data: dict) -> dict:
    """Return {"starts": list[float], "totalWeightedTardiness": float}."""
    r = input_data["releaseDates"]
    p = input_data["processingTimes"]
    d = input_data["dueDates"]
    w = input_data["weights"]
    n = len(p)
    horizon = max(r) + sum(p)

    prob = pulp.LpProblem("machine_tardiness", pulp.LpMinimize)
    starts = [
        pulp.LpVariable(f"s_{j}", lowBound=r[j], upBound=horizon - p[j])
        for j in range(n)
    ]
    tardiness = [pulp.LpVariable(f"T_{j}", lowBound=0) for j in range(n)]

    # TODO:
    # 1. Add tardiness[j] >= starts[j] + p[j] - d[j] for each job j
    # 2. For each pair i < j, create binary y_ij and Big-M non-overlap constraints (M = horizon)
    # 3. Minimize pulp.lpDot(w, tardiness), solve with pulp.HiGHS(msg=False),
    #    and return {"starts": ..., "totalWeightedTardiness": ...}
    raise NotImplementedError("Not implemented")
