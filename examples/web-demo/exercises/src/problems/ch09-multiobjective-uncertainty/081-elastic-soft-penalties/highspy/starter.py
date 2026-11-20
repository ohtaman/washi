import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "shortfalls": list[float], "excesses": list[float], "totalCost": float}."""
    unit_costs = input_data["unitCosts"]
    hours = input_data["hours"]
    targets = input_data["targets"]
    shortfall_penalties = input_data["shortfallPenalties"]
    excess_penalties = input_data["excessPenalties"]
    machine_cap = input_data["machineCap"]
    min_total = input_data["minTotal"]
    n = len(unit_costs)

    prob = pulp.LpProblem("elastic_soft_penalties", pulp.LpMinimize)

    quantities = [pulp.LpVariable(f"q_{j}", lowBound=0) for j in range(n)]
    shortfalls = [pulp.LpVariable(f"s_neg_{j}", lowBound=0) for j in range(n)]
    excesses = [pulp.LpVariable(f"s_pos_{j}", lowBound=0) for j in range(n)]

    # TODO:
    # 1. Add elastic balance equations: quantities[j] + shortfalls[j] - excesses[j] == targets[j]
    # 2. Enforce machineCap and minTotal hard constraints
    # 3. Minimize production cost + shortfall penalty + excess penalty and solve with HiGHS
    raise NotImplementedError("Not implemented")
