import pulp


def solve(fixedCosts, capacities, demands, unitCosts) -> dict:
    """Return {"open": list[int], "shipments": list[list[float]], "totalCost": float}."""
    fixed_costs = fixedCosts
    unit_costs = unitCosts
    n_f, n_d = len(fixed_costs), len(demands)

    prob = pulp.LpProblem("capacitated_facility_location", pulp.LpMinimize)

    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n_f)]
    shipments = [
        [pulp.LpVariable(f"ship_{i}_{j}", lowBound=0) for j in range(n_d)]
        for i in range(n_f)
    ]

    # TODO: Link facility capacity to opening decisions, enforce customer demands, minimize total cost, and return the result.
    raise NotImplementedError("Not implemented")
