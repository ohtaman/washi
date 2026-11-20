import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    num_elements = input_data["numElements"]
    costs = input_data["costs"]
    sets = input_data["sets"]
    m_count = len(costs)

    prob = pulp.LpProblem("set_covering", pulp.LpMinimize)
    selected = [pulp.LpVariable(f"set_{j}", cat=pulp.LpBinary) for j in range(m_count)]

    # TODO:
    # 1. For each element i in range(num_elements), require sum(selected[j] for j if i in sets[j]) >= 1
    # 2. Minimize total cost, solve with HiGHS, and return {"selected": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
