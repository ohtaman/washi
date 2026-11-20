import pulp


def solve(input_data: dict) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    dist = input_data["dist"]
    demands = input_data["demands"]
    cap = input_data["capacity"]
    max_v = input_data["maxVehicles"]
    n = len(dist)

    prob = pulp.LpProblem("cvrp_routing", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=demands[i], upBound=cap, cat=pulp.LpContinuous)
        if i > 0
        else None
        for i in range(n)
    ]

    # TODO:
    # 1. Customer in-degree and out-degree == 1 for i in 1..n-1
    # 2. Depot out-degree == depot in-degree <= max_v
    # 3. Load-tracking MTZ for i != j in 1..n-1: u[i] - u[j] + cap * x[i][j] <= cap - demands[j]
    # 4. Minimize total distance, solve with `prob.solve(pulp.HiGHS(msg=False))`, and extract routes
    raise NotImplementedError("Not implemented")
