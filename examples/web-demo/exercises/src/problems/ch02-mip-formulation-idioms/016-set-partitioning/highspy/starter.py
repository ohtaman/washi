import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    num_tasks = input_data["numTasks"]
    costs = input_data["costs"]
    routes = input_data["routes"]
    m_count = len(costs)

    prob = pulp.LpProblem("set_partitioning", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"route_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    # TODO: Ensure every task is covered exactly once, minimize total cost, and return the result.
    raise NotImplementedError("Not implemented")
