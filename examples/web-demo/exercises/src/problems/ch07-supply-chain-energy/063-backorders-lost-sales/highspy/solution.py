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

    for t in range(T):
        prev_inv = init_inv if t == 0 else inventory[t - 1]
        prev_back = 0 if t == 0 else backlog[t - 1]
        prob += prev_inv + production[t] - sales[t] == inventory[t]
        prob += prev_back + demands[t] - sales[t] - lost_sales[t] == backlog[t]

    prob += (
        unit_price * pulp.lpSum(sales)
        - pulp.lpDot(prod_costs, production)
        - hold_cost * pulp.lpSum(inventory)
        - backorder_cost * pulp.lpSum(backlog)
        - lost_penalty * pulp.lpSum(lost_sales)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "production": [float(pulp.value(v)) for v in production],
        "sales": [float(pulp.value(v)) for v in sales],
        "inventory": [float(pulp.value(v)) for v in inventory],
        "backlog": [float(pulp.value(v)) for v in backlog],
        "lostSales": [float(pulp.value(v)) for v in lost_sales],
        "netProfit": float(pulp.value(prob.objective)),
    }
