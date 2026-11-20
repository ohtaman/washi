import pulp


def solve(input_data: dict) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "totalCost": float}."""
    demands = input_data["demands"]
    setup_costs = input_data["setupCosts"]
    prod_costs = input_data["prodCosts"]
    hold_cost = input_data["holdCost"]
    capacities = input_data["capacities"]
    initial_plan = input_data["initialPlan"]
    window_size = input_data["windowSize"]
    n_periods = len(demands)

    # TODO:
    # 1. Start from fixed_setups = list(initial_plan).
    # 2. Run rolling Fix-and-Optimize passes over overlapping windows [start, start + window_size):
    #    unfix binary setup variables inside the window, keep setups outside fixed, and keep
    #    continuous production & inventory variables free across all periods.
    # 3. Solve each sub-MIP via pulp.HiGHS(msg=False), accept strictly improving solutions,
    #    and stop after a pass with no improvement.
    raise NotImplementedError("Not implemented")
