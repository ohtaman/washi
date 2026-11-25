import pulp


def solve(costs) -> dict:
    """Return {"assignment": list[int], "total_cost": float}."""
    n = len(costs)

    prob = pulp.LpProblem("task_assignment", pulp.LpMinimize)

    # Decision variables: binary x[i][j] = 1 if worker i is assigned to task j.
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) for j in range(n)]
        for i in range(n)
    ]

    # Assignment constraints: each worker gets exactly one task, and each task gets exactly one worker.
    for i in range(n):
        prob += pulp.lpSum(x[i][j] for j in range(n)) == 1
    for j in range(n):
        prob += pulp.lpSum(x[i][j] for i in range(n)) == 1

    # Objective: minimize total assignment cost.
    prob += pulp.lpSum(costs[i][j] * x[i][j] for i in range(n) for j in range(n))
    prob.solve(pulp.HiGHS(msg=False))

    # Round before comparing to 1 to guard against solver floating-point tolerances.
    assignment = [
        next(j for j in range(n) if round(pulp.value(x[i][j])) == 1)
        for i in range(n)
    ]

    return {
        "assignment": assignment,
        "total_cost": float(pulp.value(prob.objective)),
    }
