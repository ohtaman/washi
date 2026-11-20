import pulp


def solve(input_data: dict) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "totalCost": float}."""
    demands = input_data["demands"]
    setup_costs = input_data["setupCosts"]
    prod_costs = input_data["prodCosts"]
    hold_costs = input_data["holdCosts"]
    capacities = input_data["capacities"]
    T = len(demands)

    prob = pulp.LpProblem("single_item_lot_sizing", pulp.LpMinimize)

    setups = [pulp.LpVariable(f"y_{t}", cat=pulp.LpBinary) for t in range(T)]
    production = [pulp.LpVariable(f"x_{t}", lowBound=0) for t in range(T)]
    inventory = [pulp.LpVariable(f"inv_{t}", lowBound=0) for t in range(T)]

    # TODO:
    # 1. Add capacity-linking constraints and flow conservation equations
    # 2. Minimize setup + production + holding cost and solve with pulp.HiGHS(msg=False)
    # 3. Return {"setups": ..., "production": ..., "inventory": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
