import pulp


def solve(
    plantFixedCosts,
    plantCaps,
    dcFixedCosts,
    dcCaps,
    demands,
    plantDcCosts,
    dcCustomerCosts,
) -> dict:
    """Return {"openPlants": list[int], "openDcs": list[int], "plantToDc": list[list[float]], "dcToCustomer": list[list[float]], "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
