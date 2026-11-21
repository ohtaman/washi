import pulp


def solve(
    demands,
    minRegular,
    maxRegular,
    regularCosts,
    overtimePenalties,
    totalRegularCap,
) -> dict:
    """Return {"regular": list[float], "shortage": list[float], "totalCost": float}."""
    min_reg = minRegular
    max_reg = maxRegular
    reg_costs = regularCosts
    penalties = overtimePenalties
    total_cap = totalRegularCap
    T = len(demands)

    prob = pulp.LpProblem("positive_part_overtime", pulp.LpMinimize)

    # TODO: Build and solve the overtime and shortage cost LP, then return the output.
    raise NotImplementedError("Not implemented")
