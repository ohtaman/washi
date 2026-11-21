import pulp


def solve(
    actual_demands,
    forecast_demands,
    prod_costs,
    prod_cap,
    hold_cost,
    shortfall_penalty,
    initial_inventory,
    window_len,
) -> dict:
    """Return {"produced": list[float], "inventories": list[float], "shortfalls": list[float], "totalCost": float}."""
    # TODO: Run the rolling-horizon MPC loop over all periods and return the output.
    raise NotImplementedError("Not implemented")
