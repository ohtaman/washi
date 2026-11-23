import pulp


def solve(costs) -> dict:
    """Return {"assignment": list[int], "total_cost": float}."""
    n = len(costs)

    prob = pulp.LpProblem("task_assignment", pulp.LpMinimize)

    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) for j in range(n)]
        for i in range(n)
    ]

    # TODO:
    # 1. Enforce row sum == 1 and column sum == 1
    # 2. Set objective `prob += ...` on sum(costs[i][j] * x[i][j]) and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Extract assignment[i] = column j with round(pulp.value(x[i][j])) == 1 and return {"assignment": ..., "total_cost": ...}
    raise NotImplementedError("Not implemented")
