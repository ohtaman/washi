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
    """Return {"openPlants": list[int], "openDcs": list[int], "plantToDc": list[list[float]], "dcToCustomer": list[list[float]], "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
