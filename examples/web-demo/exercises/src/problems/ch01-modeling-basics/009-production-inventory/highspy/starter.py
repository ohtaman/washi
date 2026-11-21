import pulp


def solve(
    demands,
    reg_cap,
    ot_cap,
    inv_cap,
    initial_inventory,
    min_final_inventory,
    reg_cost,
    ot_cost,
    hold_cost,
) -> dict:
    """Return {"regular": list[float], "overtime": list[float], "inventory": list[float], "totalCost": float}."""
    init_inv = initial_inventory
    min_end_inv = min_final_inventory
    T = len(demands)

    prob = pulp.LpProblem("production_inventory", pulp.LpMinimize)

    regular = [pulp.LpVariable(f"reg_{t}", lowBound=0, upBound=reg_cap[t]) for t in range(T)]
    overtime = [pulp.LpVariable(f"ot_{t}", lowBound=0, upBound=ot_cap[t]) for t in range(T)]
    inventory = [
        pulp.LpVariable(
            f"inv_{t}",
            lowBound=float(min_end_inv if t == T - 1 else 0),
            upBound=float(inv_cap),
        )
        for t in range(T)
    ]

    # TODO:
    # 1. For each period t in range(T), add the inventory balance constraint == demands[t]
    # 2. Set objective `prob += ...` on total regular + overtime + holding cost and call `prob.solve(pulp.HiGHS(msg=False))`
    # 3. Return {"regular": [...], "overtime": [...], "inventory": [...], "totalCost": float(pulp.value(prob.objective))}
    raise NotImplementedError("Not implemented")
