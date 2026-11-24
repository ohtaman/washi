import pulp


def solve(
    order_costs,
    shortage_costs,
    salvage_values,
    warehouse_cap,
    probs,
    demands,
) -> dict:
    """Return {"orders": list[float], "expected_cost": float}."""
    # TODO: Build and solve the two-stage stochastic LP, then return the output.
    raise NotImplementedError("Not implemented")
