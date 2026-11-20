import pulp


def solve(input_data: dict) -> dict:
    """Return {"flows": list[float], "totalCost": float}."""
    supplies = input_data["supplies"]
    edges = input_data["edges"]
    n = len(supplies)

    prob = pulp.LpProblem("min_cost_flow_tu", pulp.LpMinimize)
    flows = [
        pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
        for i, e in enumerate(edges)
    ]

    # TODO:
    # 1. Enforce flow conservation at each node v: outflow(v) - inflow(v) == supplies[v]
    # 2. Set objective `prob += ...` to minimize total shipping cost,
    #    call `prob.solve(pulp.HiGHS(msg=False))`, and return {"flows": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
