import pulp


def solve(input_data: dict) -> dict:
    """Return {"b": list[int], "x": list[float], "z": list[float], "totalCost": float}."""
    min_ord = input_data["minOrders"]
    max_ord = input_data["maxOrders"]
    base_costs = input_data["baseCosts"]
    discounts = input_data["discounts"]
    fees = input_data["contractFees"]
    demand = input_data["totalDemand"]
    n = len(min_ord)

    prob = pulp.LpProblem("glover_product", pulp.LpMinimize)

    b = [pulp.LpVariable(f"b_{i}", cat=pulp.LpBinary) for i in range(n)]
    x = [
        pulp.LpVariable(f"x_{i}", lowBound=float(min_ord[i]), upBound=float(max_ord[i]))
        for i in range(n)
    ]
    z = [
        pulp.LpVariable(f"z_{i}", lowBound=0, upBound=float(max_ord[i]))
        for i in range(n)
    ]

    # TODO:
    # 1. Enforce sum(x) >= demand
    # 2. Enforce exact Glover linearization of z[i] = b[i] * x[i] for each i
    # 3. Minimize base costs + contract fees - discounts on z,
    #    call prob.solve(pulp.HiGHS(msg=False)), and return {"b": ..., "x": ..., "z": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
