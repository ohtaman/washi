import pulp


def solve(supplies, demands, fixed_costs, unit_costs, capacities) -> dict:
    """Return {"open": list[list[int]], "shipments": list[list[float]], "total_cost": float}."""
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

    # TODO: Add capacity-linking, supply, and demand constraints, minimize total cost, and return the result.
    raise NotImplementedError("Not implemented")
