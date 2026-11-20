import pulp


def solve(input_data: dict) -> dict:
    """Return {"production": list[float], "sales": list[float], "inventory": list[float], "backlog": list[float], "lostSales": list[float], "netProfit": float}."""
    demands = input_data["demands"]
    capacities = input_data["capacities"]
    prod_costs = input_data["prodCosts"]
    unit_price = input_data["unitPrice"]
    hold_cost = input_data["holdCost"]
    backorder_cost = input_data["backorderCost"]
    lost_penalty = input_data["lostSalePenalty"]
    init_inv = input_data["initialInventory"]
    T = len(demands)

    prob = pulp.LpProblem("backorders_lost_sales", pulp.LpMaximize)

    production = [pulp.LpVariable(f"prod_{t}", lowBound=0, upBound=capacities[t]) for t in range(T)]
    sales = [pulp.LpVariable(f"sales_{t}", lowBound=0) for t in range(T)]
    inventory = [pulp.LpVariable(f"inv_{t}", lowBound=0) for t in range(T)]
    backlog = [pulp.LpVariable(f"back_{t}", lowBound=0, upBound=(0 if t == T - 1 else None)) for t in range(T)]
    lost_sales = [pulp.LpVariable(f"lost_{t}", lowBound=0, upBound=demands[t]) for t in range(T)]

    # TODO:
    # 1. Add physical inventory balance and backlog/demand conservation equations
    # 2. Maximize net profit and solve with pulp.HiGHS(msg=False)
    # 3. Return {"production": ..., "sales": ..., "inventory": ..., "backlog": ..., "lostSales": ..., "netProfit": ...}
    raise NotImplementedError("Not implemented")
