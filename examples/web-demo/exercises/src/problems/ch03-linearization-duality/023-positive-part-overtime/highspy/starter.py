import pulp


def solve(input_data: dict) -> dict:
    """Return {"regular": list[float], "shortage": list[float], "totalCost": float}."""
    demands = input_data["demands"]
    min_reg = input_data["minRegular"]
    max_reg = input_data["maxRegular"]
    reg_costs = input_data["regularCosts"]
    penalties = input_data["overtimePenalties"]
    total_cap = input_data["totalRegularCap"]
    T = len(demands)

    prob = pulp.LpProblem("positive_part_overtime", pulp.LpMinimize)

    # TODO: Build and solve the overtime and shortage cost LP, then return the output.
    raise NotImplementedError("Not implemented")
