import pulp


def solve(
    external_demands,
    bom,
    lead_times,
    initial_inventory,
    setup_costs,
    prod_costs,
    hold_costs,
    capacities,
) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[int]], "inventory": list[list[float]], "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
