import pulp


def solve(input_data: dict) -> dict:
    """Return {"open": list[int], "shipments": list[list[float]], "totalCost": float}."""
    fixed_costs = input_data["fixedCosts"]
    capacities = input_data["capacities"]
    demands = input_data["demands"]
    unit_costs = input_data["unitCosts"]
    n_f, n_d = len(fixed_costs), len(demands)

    prob = pulp.LpProblem("capacitated_facility_location", pulp.LpMinimize)

    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n_f)]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_f)
    ]

    # TODO:
    # 1. Link facility capacity: sum(shipments[i][j] for j) <= capacities[i] * open_vars[i]
    # 2. Enforce customer demands: sum(shipments[i][j] for i) >= demands[j]
    # 3. Minimize fixed + shipping costs, solve with HiGHS, and return dict
    raise NotImplementedError("Not implemented")
