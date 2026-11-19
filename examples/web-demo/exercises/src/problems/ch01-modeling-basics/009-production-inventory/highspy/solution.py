import highspy


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

    h = highspy.Highs()
    h.silent()

    regular = [h.addVariable(lb=0.0, ub=reg_cap[t], name=f"reg_{t}") for t in range(T)]
    overtime = [h.addVariable(lb=0.0, ub=ot_cap[t], name=f"ot_{t}") for t in range(T)]
    inventory = [
        h.addVariable(
            lb=float(min_end_inv if t == T - 1 else 0.0),
            ub=float(inv_cap),
            name=f"inv_{t}",
        )
        for t in range(T)
    ]

    for t in range(T):
        prev = init_inv if t == 0 else inventory[t - 1]
        h.addConstr(prev + regular[t] + overtime[t] - inventory[t] == demands[t])

    h.minimize(
        reg_cost * h.qsum(regular) + ot_cost * h.qsum(overtime) + hold_cost * h.qsum(inventory)
    )

    return {
        "regular": [float(h.val(v)) for v in regular],
        "overtime": [float(h.val(v)) for v in overtime],
        "inventory": [float(h.val(v)) for v in inventory],
        "totalCost": float(h.getObjectiveValue()),
    }
