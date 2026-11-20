import pulp


def solve(input_data: dict) -> dict:
    """Return {"order": list[int], "completions": list[float], "totalTardiness": float}."""
    p = input_data["processingTimes"]
    s = input_data["setupMatrix"]
    d = input_data["dueDates"]
    n = len(p)
    max_setup = max((max(row) for row in s), default=0)
    horizon = sum(p) + max(0, n - 1) * max_setup

    prob = pulp.LpProblem("sequence_dependent_setups", pulp.LpMinimize)
    x = {
        (i, j): pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary)
        for i in range(n + 1)
        for j in range(n + 1)
        if i != j
    }
    completions = [
        pulp.LpVariable(f"C_{j}", lowBound=p[j], upBound=horizon) for j in range(n)
    ]
    tardiness = [pulp.LpVariable(f"T_{j}", lowBound=0) for j in range(n)]

    # TODO:
    # 1. Enforce out-degree == 1 and in-degree == 1 for all nodes 0..n (depot n)
    # 2. Propagate completion times across arcs (i, j) with big_m = horizon + max_setup
    # 3. Link tardiness[j] >= completions[j] - d[j], minimize sum(tardiness), solve,
    #    and reconstruct order starting from dummy depot n
    raise NotImplementedError("Not implemented")
