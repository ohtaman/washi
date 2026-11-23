import pulp


def solve(
    demands,
    setup_costs,
    hold_costs,
    unit_times,
    setup_times,
    capacities,
) -> dict:
    """Return {"setups": list[list[int]], "production": list[list[float]], "inventory": list[list[float]], "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
