import pulp


def solve(
    demands,
    unitCosts,
    fixedCosts,
    minOrders,
    maxOrders,
    maxShare,
    minSuppliers,
    maxSuppliers,
) -> dict:
    """Return {"active": list[int], "allocations": list[list[float]], "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
