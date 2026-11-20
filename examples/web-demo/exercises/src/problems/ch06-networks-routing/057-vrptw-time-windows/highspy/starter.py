import pulp


def solve(input_data: dict) -> dict:
    """Return {"routes": list[list[int]], "totalCost": float}."""
    dist = input_data["dist"]
    earliest = input_data["earliest"]
    latest = input_data["latest"]
    service = input_data["service"]
    max_v = input_data["maxVehicles"]
    n = len(dist)

    prob = pulp.LpProblem("vrptw", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    t = [
        pulp.LpVariable(f"t_{i}", lowBound=earliest[i], upBound=latest[i], cat=pulp.LpContinuous)
        for i in range(n)
    ]

    # TODO:
    # 1. Fix t[0] == earliest[0], enforce customer degree == 1 and depot vehicle limits <= max_v
    # 2. Add Big-M time-window propagation constraints on arcs (0->j), (i->j), and (i->0)
    # 3. Minimize total travel cost, solve with `prob.solve(pulp.HiGHS(msg=False))`, and reconstruct routes
    raise NotImplementedError("Not implemented")
