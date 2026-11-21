import pulp


def solve(
    demands,
    min_regular,
    max_regular,
    regular_costs,
    overtime_penalties,
    total_regular_cap,
) -> dict:
    """Return {"regular": list[float], "shortage": list[float], "totalCost": float}."""
    min_reg = min_regular
    max_reg = max_regular
    reg_costs = regular_costs
    penalties = overtime_penalties
    total_cap = total_regular_cap
    T = len(demands)

    prob = pulp.LpProblem("positive_part_overtime", pulp.LpMinimize)

    # TODO: Build and solve the overtime and shortage cost LP, then return the output.
    raise NotImplementedError("Not implemented")
