import pulp


def solve(demands, setup_costs, prod_costs, hold_costs, capacities) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "total_cost": float}."""
    T = len(demands)

    prob = pulp.LpProblem("single_item_lot_sizing_fl", pulp.LpMinimize)

    setups = [pulp.LpVariable(f"y_{t}", cat=pulp.LpBinary) for t in range(T)]
    w = {
        (t, k): pulp.LpVariable(f"w_{t}_{k}", lowBound=0)
        for t in range(T)
        for k in range(t, T)
    }

    for k in range(T):
        prob += pulp.lpSum(w[(t, k)] for t in range(k + 1)) == demands[k]

    for t in range(T):
        prob += pulp.lpSum(w[(t, k)] for k in range(t, T)) <= capacities[t] * setups[t]
        for k in range(t, T):
            prob += w[(t, k)] <= demands[k] * setups[t]

    prob += pulp.lpDot(setup_costs, setups) + pulp.lpSum(
        (prod_costs[t] + sum(hold_costs[tau] for tau in range(t, k))) * w[(t, k)]
        for t in range(T)
        for k in range(t, T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    production = [sum(float(pulp.value(w[(t, k)])) for k in range(t, T)) for t in range(T)]
    inventory = [
        sum(
            float(pulp.value(w[(tau, k)]))
            for tau in range(t + 1)
            for k in range(t + 1, T)
        )
        for t in range(T)
    ]

    return {
        "setups": [round(pulp.value(v)) for v in setups],
        "production": production,
        "inventory": inventory,
        "total_cost": float(pulp.value(prob.objective)),
    }
