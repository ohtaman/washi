import pulp


def solve(
    plant_fixed_costs,
    plant_caps,
    dc_fixed_costs,
    dc_caps,
    demands,
    plant_dc_costs,
    dc_customer_costs,
) -> dict:
    """Return {"open_plants": list[int], "open_dcs": list[int], "plant_to_dc": list[list[float]], "dc_to_customer": list[list[float]], "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
