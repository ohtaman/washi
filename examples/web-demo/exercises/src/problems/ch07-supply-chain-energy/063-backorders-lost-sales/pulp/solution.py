import pulp


def solve(
    demands,
    capacities,
    prod_costs,
    unit_price,
    hold_cost,
    backorder_cost,
    lost_sale_penalty,
    initial_inventory,
) -> dict:
    """Return {"production": list[float], "sales": list[float], "inventory": list[float], "backlog": list[float], "lost_sales": list[float], "net_profit": float}."""
    lost_penalty = lost_sale_penalty
    init_inv = initial_inventory
    T = len(demands)

    prob = pulp.LpProblem("backorders_lost_sales", pulp.LpMaximize)

    # Decision variables per period t:
    # production[t] in [0, capacities[t]], sales[t] >= 0, inventory[t] >= 0,
    # backlog[t] >= 0 (forced to 0 at terminal period T - 1), lost_sales[t] in [0, demands[t]]
    production = [pulp.LpVariable(f"prod_{t}", lowBound=0, upBound=capacities[t]) for t in range(T)]
    sales = [pulp.LpVariable(f"sales_{t}", lowBound=0) for t in range(T)]
    inventory = [pulp.LpVariable(f"inv_{t}", lowBound=0) for t in range(T)]
    backlog = [pulp.LpVariable(f"back_{t}", lowBound=0, upBound=(0 if t == T - 1 else None)) for t in range(T)]
    lost_sales = [pulp.LpVariable(f"lost_{t}", lowBound=0, upBound=demands[t]) for t in range(T)]

    # Physical inventory balance and demand-backlog-lost-sales balance for each period t
    for t in range(T):
        prev_inv = init_inv if t == 0 else inventory[t - 1]
        prev_back = 0 if t == 0 else backlog[t - 1]
        prob += prev_inv + production[t] - sales[t] == inventory[t]
        prob += prev_back + demands[t] - sales[t] - lost_sales[t] == backlog[t]

    # Objective: maximize sales revenue minus production, holding, backorder, and lost-sale penalty costs
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
        "lost_sales": [float(pulp.value(v)) for v in lost_sales],
        "net_profit": float(pulp.value(prob.objective)),
    }
