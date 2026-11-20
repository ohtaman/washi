import pulp


def solve(input_data: dict) -> dict:
    """Return {"orders": list[float], "expectedCost": float}."""
    order_costs = input_data["orderCosts"]
    shortage_costs = input_data["shortageCosts"]
    salvage_values = input_data["salvageValues"]
    warehouse_cap = input_data["warehouseCap"]
    probs = input_data["probs"]
    demands = input_data["demands"]
    n = len(order_costs)
    S = len(probs)

    prob = pulp.LpProblem("two_stage_stochastic", pulp.LpMinimize)
    orders = [pulp.LpVariable(f"x_{j}", lowBound=0) for j in range(n)]
    shortage = [
        [pulp.LpVariable(f"short_{s}_{j}", lowBound=0) for j in range(n)]
        for s in range(S)
    ]
    leftover = [
        [pulp.LpVariable(f"left_{s}_{j}", lowBound=0) for j in range(n)]
        for s in range(S)
    ]

    # TODO:
    # 1. Add warehouse capacity constraint on orders
    # 2. Add scenario recourse equations orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]
    # 3. Minimize expected total cost, solve with HiGHS, and return {"orders": ..., "expectedCost": ...}
    raise NotImplementedError("Not implemented")
