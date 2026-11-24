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
    """Return {"regular": list[float], "overtime": list[float], "inventory": list[float], "total_cost": float}."""
    init_inv = initial_inventory
    min_end_inv = min_final_inventory
    T = len(demands)

    prob = pulp.LpProblem("production_inventory", pulp.LpMinimize)

    # Decision variables: regular production, overtime production, and end-of-period inventory per period t.
    # Final period inventory is lower-bounded by min_final_inventory; earlier periods are >= 0.
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

    # Flow balance per period: previous inventory + production - ending inventory == demand.
    for t in range(T):
        prev = init_inv if t == 0 else inventory[t - 1]
        prob += prev + regular[t] + overtime[t] - inventory[t] == demands[t]

    # Objective: minimize total regular, overtime, and inventory holding costs.
    prob += (
        reg_cost * pulp.lpSum(regular)
        + ot_cost * pulp.lpSum(overtime)
        + hold_cost * pulp.lpSum(inventory)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "regular": [float(pulp.value(v)) for v in regular],
        "overtime": [float(pulp.value(v)) for v in overtime],
        "inventory": [float(pulp.value(v)) for v in inventory],
        "total_cost": float(pulp.value(prob.objective)),
    }
