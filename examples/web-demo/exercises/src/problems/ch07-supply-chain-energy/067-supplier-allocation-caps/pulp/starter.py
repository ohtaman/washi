import pulp


def solve(
    demands,
    unit_costs,
    fixed_costs,
    min_orders,
    max_orders,
    max_share,
    min_suppliers,
    max_suppliers,
) -> dict:
    """Return {"active": list[int], "allocations": list[list[float]], "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
