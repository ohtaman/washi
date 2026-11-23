import pulp


def solve(
    demands,
    setup_costs,
    hold_costs,
    unit_times,
    setup_times,
    capacities,
) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[float]], "inventory": list[list[float]], "total_cost": float}."""
    n_items = len(demands)
    T = len(capacities)

    prob = pulp.LpProblem("multi_item_clsp", pulp.LpMinimize)

    setups = [
        [pulp.LpVariable(f"y_{i}_{t}", cat=pulp.LpBinary) for t in range(T)]
        for i in range(n_items)
    ]
    production = [
        [pulp.LpVariable(f"x_{i}_{t}", lowBound=0) for t in range(T)]
        for i in range(n_items)
    ]
    inventory = [
        [pulp.LpVariable(f"inv_{i}_{t}", lowBound=0) for t in range(T)]
        for i in range(n_items)
    ]

    for i in range(n_items):
        for t in range(T):
            prev = 0 if t == 0 else inventory[i][t - 1]
            prob += prev + production[i][t] - inventory[i][t] == demands[i][t]
            rem_demand = sum(demands[i][t:])
            prob += production[i][t] <= rem_demand * setups[i][t]

    for t in range(T):
        prob += (
            pulp.lpSum(
                unit_times[i] * production[i][t] + setup_times[i] * setups[i][t]
                for i in range(n_items)
            )
            <= capacities[t]
        )

    prob += pulp.lpSum(
        setup_costs[i] * setups[i][t] + hold_costs[i] * inventory[i][t]
        for i in range(n_items)
        for t in range(T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "setups": [[round(pulp.value(v)) for v in row] for row in setups],
        "production": [[float(pulp.value(v)) for v in row] for row in production],
        "inventory": [[float(pulp.value(v)) for v in row] for row in inventory],
        "total_cost": float(pulp.value(prob.objective)),
    }
