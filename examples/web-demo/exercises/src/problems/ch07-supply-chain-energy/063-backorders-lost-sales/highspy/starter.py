import pulp


def solve(
    demands,
    capacities,
    prod_costs,
    unit_price,
    hold_cost,
    backorder_cost,
    lost_sale_penalty,
    initial_inventory,
) -> dict:
    """Return {"production": list[float], "sales": list[float], "inventory": list[float], "backlog": list[float], "lost_sales": list[float], "net_profit": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
