import pulp


def solve(input_data: dict) -> dict:
    """Return {"regular": list[float], "overtime": list[float], "inventory": list[float], "totalCost": float}."""
    demands = input_data["demands"]
    reg_cap = input_data["regCap"]
    ot_cap = input_data["otCap"]
    inv_cap = input_data["invCap"]
    init_inv = input_data["initialInventory"]
    min_end_inv = input_data["minFinalInventory"]
    reg_cost = input_data["regCost"]
    ot_cost = input_data["otCost"]
    hold_cost = input_data["holdCost"]
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
