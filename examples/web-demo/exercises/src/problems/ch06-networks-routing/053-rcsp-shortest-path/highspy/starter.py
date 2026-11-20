import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    n = input_data["nodeCount"]
    s = input_data["source"]
    t = input_data["sink"]
    max_r = input_data["maxResource"]
    edges = input_data["edges"]

    prob = pulp.LpProblem("rcsp_shortest_path", pulp.LpMinimize)
    x = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(len(edges))]

    # TODO:
    # 1. Enforce s->t unit flow conservation at every node v
    # 2. Enforce sum(resource * x) <= max_r
    # 3. Minimize total cost, call `prob.solve(pulp.HiGHS(msg=False))`,
    #    and return {"selected": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
