import pulp


def solve(
    demands,
    setup_costs,
    prod_costs,
    hold_cost,
    capacities,
    initial_plan,
    window_size,
) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "totalCost": float}."""
    # TODO: Improve the initial lot-sizing plan via Fix-and-Optimize LNS and return the schedule.
    raise NotImplementedError("Not implemented")
