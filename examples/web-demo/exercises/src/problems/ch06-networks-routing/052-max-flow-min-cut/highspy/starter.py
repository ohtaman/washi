import pulp


def solve(input_data: dict) -> dict:
    """Return {"flows": list[float], "cutEdges": list[int], "maxFlow": float}."""
    n = input_data["nodeCount"]
    s = input_data["source"]
    t = input_data["sink"]
    edges = input_data["edges"]

    prob = pulp.LpProblem("max_flow_min_cut", pulp.LpMaximize)
    flows = [
        pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
        for i, e in enumerate(edges)
    ]

    # TODO:
    # 1. Add flow conservation for intermediate nodes v not in (s, t)
    # 2. Maximize net flow leaving s, solve with `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Traverse residual graph from s (forward if f < cap - 1e-6, backward if f > 1e-6)
    #    to extract cutEdges crossing from reachable S to unreachable V \ S.
    raise NotImplementedError("Not implemented")
