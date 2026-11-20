import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignment": list[int], "totalCost": float}."""
    costs = input_data["costs"]
    n = len(costs)

    prob = pulp.LpProblem("task_assignment", pulp.LpMinimize)

    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) for j in range(n)]
        for i in range(n)
    ]

    # TODO:
    # 1. Enforce row sum == 1 and column sum == 1
    # 2. Set objective `prob += ...` on sum(costs[i][j] * x[i][j]) and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Extract assignment[i] = column j with round(pulp.value(x[i][j])) == 1 and return {"assignment": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
