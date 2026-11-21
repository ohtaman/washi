import pulp


def solve(
    demands,
    regCap,
    otCap,
    invCap,
    initialInventory,
    minFinalInventory,
    regCost,
    otCost,
    holdCost,
) -> dict:
    """Return {"regular": list[float], "overtime": list[float], "inventory": list[float], "totalCost": float}."""
    reg_cap = regCap
    ot_cap = otCap
    inv_cap = invCap
    init_inv = initialInventory
    min_end_inv = minFinalInventory
    reg_cost = regCost
    ot_cost = otCost
    hold_cost = holdCost
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

    for t in range(T):
        prev = init_inv if t == 0 else inventory[t - 1]
        prob += prev + regular[t] + overtime[t] - inventory[t] == demands[t]

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
        "totalCost": float(pulp.value(prob.objective)),
    }
