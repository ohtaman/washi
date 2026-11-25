import pulp


def solve(
    demands,
    p_min,
    p_max,
    ramp_limit,
    min_up,
    min_down,
    startup_costs,
    fuel_costs,
) -> dict:
    """Return {"commitment": list[list[int]], "generation": list[list[float]], "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
