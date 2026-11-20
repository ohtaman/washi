import pulp


def solve(input_data: dict) -> dict:
    """Return {"open": list[int], "quantities": list[float], "totalCost": float, "lpBound": float}."""
    fixed_costs = input_data["fixedCosts"]
    unit_costs = input_data["unitCosts"]
    capacities = input_data["capacities"]
    demand = input_data["demand"]
    n = len(fixed_costs)

    # TODO:
    # 1. Build both the LP relaxation (LpContinuous in [0, 1]) and MIP (LpBinary)
    #    using tight Big-M: M_i = min(capacities[i], demand) for each plant i
    # 2. Enforce quantities[i] <= M_i * open_vars[i] and sum(quantities) >= demand
    # 3. Minimize fixed + variable costs with pulp.HiGHS(msg=False)
    # 4. Return {"open": ..., "quantities": ..., "totalCost": ..., "lpBound": ...}
    raise NotImplementedError("Not implemented")
