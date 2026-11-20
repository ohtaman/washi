import pulp


def solve(input_data: dict) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[float]], "inventory": list[list[float]], "totalCost": float}."""
    demands = input_data["demands"]
    setup_costs = input_data["setupCosts"]
    hold_costs = input_data["holdCosts"]
    unit_times = input_data["unitTimes"]
    setup_times = input_data["setupTimes"]
    capacities = input_data["capacities"]
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

    # TODO:
    # 1. Add inventory flow balance and production-setup linking constraints
    # 2. Add shared machine capacity constraint per period t
    # 3. Minimize total setup + holding cost, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
