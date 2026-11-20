import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    num_tasks = input_data["numTasks"]
    costs = input_data["costs"]
    routes = input_data["routes"]
    m_count = len(costs)

    prob = pulp.LpProblem("set_partitioning", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"route_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    # TODO:
    # 1. For each task i in range(num_tasks), enforce sum(selected[j] for j if i in routes[j]) == 1
    # 2. Minimize total cost, solve with HiGHS, and return {"selected": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
