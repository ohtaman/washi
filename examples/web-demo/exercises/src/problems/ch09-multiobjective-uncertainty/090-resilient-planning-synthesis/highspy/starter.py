import pulp


def solve(
    fixed_costs,
    capacities,
    drop_amounts,
    gamma,
    robust_min_cap,
    probs,
    demands,
    offline,
    disruption_cost,
    shortfall_penalty,
) -> dict:
    """Return {"committed": list[int], "recovered": list[list[int]], "total_cost": float}."""
    # TODO: Build and solve the resilient planning and recovery MIP, then return the output.
    raise NotImplementedError("Not implemented")
