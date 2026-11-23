import pulp


def solve(
    external_demands,
    bom,
    lead_times,
    initial_inventory,
    setup_costs,
    prod_costs,
    hold_costs,
    capacities,
) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[int]], "inventory": list[list[float]], "total_cost": float}."""
    ext_demands = external_demands
    init_inv = initial_inventory
    n_items = len(ext_demands)
    T = len(ext_demands[0]) if n_items > 0 else 0

    prob = pulp.LpProblem("multilevel_bom_mrp", pulp.LpMinimize)

    setups = [
        [pulp.LpVariable(f"y_{i}_{t}", cat=pulp.LpBinary) for t in range(T)]
        for i in range(n_items)
    ]
    production = [
        [pulp.LpVariable(f"x_{i}_{t}", lowBound=0, upBound=capacities[i], cat=pulp.LpInteger) for t in range(T)]
        for i in range(n_items)
    ]
    inventory = [
        [pulp.LpVariable(f"inv_{i}_{t}", lowBound=0) for t in range(T)]
        for i in range(n_items)
    ]

    for i in range(n_items):
        L = lead_times[i]
        for t in range(T):
            prob += production[i][t] <= capacities[i] * setups[i][t]
            prev_inv = init_inv[i] if t == 0 else inventory[i][t - 1]
            arrival = production[i][t - L] if t >= L else 0
            dep_demand = pulp.lpSum(
                bom[i][j] * production[j][t]
                for j in range(n_items)
                if bom[i][j] != 0
            )
            prob += prev_inv + arrival - dep_demand - inventory[i][t] == ext_demands[i][t]

    prob += pulp.lpSum(
        setup_costs[i] * setups[i][t]
        + prod_costs[i] * production[i][t]
        + hold_costs[i] * inventory[i][t]
        for i in range(n_items)
        for t in range(T)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "setups": [[round(pulp.value(v)) for v in row] for row in setups],
        "production": [[round(pulp.value(v)) for v in row] for row in production],
        "inventory": [[float(pulp.value(v)) for v in row] for row in inventory],
        "total_cost": float(pulp.value(prob.objective)),
    }
