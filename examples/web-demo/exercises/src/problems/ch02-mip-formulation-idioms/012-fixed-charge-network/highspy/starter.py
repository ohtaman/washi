import pulp


def solve(input_data: dict) -> dict:
    """Return {"open": list[list[int]], "shipments": list[list[float]], "totalCost": float}."""
    supplies = input_data["supplies"]
    demands = input_data["demands"]
    fixed_costs = input_data["fixedCosts"]
    unit_costs = input_data["unitCosts"]
    capacities = input_data["capacities"]
    n_s, n_d = len(supplies), len(demands)

    prob = pulp.LpProblem("fixed_charge_network", pulp.LpMinimize)

    open_vars = [
        [pulp.LpVariable(f"open_{i}_{j}", cat=pulp.LpBinary) for j in range(n_d)]
        for i in range(n_s)
    ]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_s)
    ]

    # TODO:
    # 1. Link lane capacity: shipments[i][j] <= capacities[i][j] * open_vars[i][j]
    # 2. Enforce supplies[i] upper bounds and demands[j] lower bounds
    # 3. Minimize sum of fixedCosts * open_vars + unitCosts * shipments, solve, and return dict
    raise NotImplementedError("Not implemented")
