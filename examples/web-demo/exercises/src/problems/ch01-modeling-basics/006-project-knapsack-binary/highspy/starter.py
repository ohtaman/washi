import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    budget = input_data["budget"]
    costs = input_data["costs"]
    values = input_data["values"]
    n = len(costs)

    prob = pulp.LpProblem("project_knapsack", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

    # TODO:
    # 1. Add budget constraint sum(costs[i] * selected[i]) <= budget
    # 2. Set objective `prob += ...` on sum(values[i] * selected[i]) and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Return {"selected": [round(pulp.value(v)) for v in selected], "totalValue": float(pulp.value(prob.objective))}
    raise NotImplementedError("Not implemented")
