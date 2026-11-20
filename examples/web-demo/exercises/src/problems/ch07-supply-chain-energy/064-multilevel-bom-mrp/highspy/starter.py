import pulp


def solve(input_data: dict) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[int]], "inventory": list[list[float]], "totalCost": float}."""
    ext_demands = input_data["externalDemands"]
    bom = input_data["bom"]
    lead_times = input_data["leadTimes"]
    init_inv = input_data["initialInventory"]
    setup_costs = input_data["setupCosts"]
    prod_costs = input_data["prodCosts"]
    hold_costs = input_data["holdCosts"]
    capacities = input_data["capacities"]
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

    # TODO:
    # 1. Link production <= capacities[i] * setups[i][t]
    # 2. Enforce BOM dependent demand & lead-time arrivals in each item's inventory balance
    # 3. Minimize total setup + production + holding cost, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
