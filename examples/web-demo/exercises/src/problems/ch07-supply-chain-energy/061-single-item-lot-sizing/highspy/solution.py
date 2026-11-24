import pulp


def solve(demands, setup_costs, prod_costs, hold_costs, capacities) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "total_cost": float}."""
    T = len(demands)

    prob = pulp.LpProblem("single_item_lot_sizing_fl", pulp.LpMinimize)

    # setups[t]: 1 if setup occurs in period t (binary)
    # w[(t, k)]: units produced in period t to satisfy demand in period k >= t (>= 0, facility-location disaggregation)
    setups = [pulp.LpVariable(f"y_{t}", cat=pulp.LpBinary) for t in range(T)]
    w = {
        (t, k): pulp.LpVariable(f"w_{t}_{k}", lowBound=0)
        for t in range(T)
        for k in range(t, T)
    }

    # Demand satisfaction: total units produced across periods t <= k equal demand[k]
    for k in range(T):
        prob += pulp.lpSum(w[(t, k)] for t in range(k + 1)) == demands[k]

    # Capacity limit and strong variable-upper-bound disaggregation (w_{t,k} <= d_k * y_t tightens LP relaxation)
    for t in range(T):
        prob += pulp.lpSum(w[(t, k)] for k in range(t, T)) <= capacities[t] * setups[t]
        for k in range(t, T):
            prob += w[(t, k)] <= demands[k] * setups[t]

    # Objective: minimize setup costs plus production and cumulative holding costs (from t to k-1)
    prob += pulp.lpDot(setup_costs, setups) + pulp.lpSum(
        (prod_costs[t] + sum(hold_costs[tau] for tau in range(t, k))) * w[(t, k)]
        for t in range(T)
        for k in range(t, T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Reconstruct period production and ending inventory (stock produced at tau <= t for future k > t)
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
        # Round binary values to eliminate floating-point solver tolerance noise
        "setups": [round(pulp.value(v)) for v in setups],
        "production": production,
        "inventory": inventory,
        "total_cost": float(pulp.value(prob.objective)),
    }
