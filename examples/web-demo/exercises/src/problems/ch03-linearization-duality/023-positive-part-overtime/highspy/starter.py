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

    regular = [
        pulp.LpVariable(f"reg_{t}", lowBound=float(min_reg[t]), upBound=float(max_reg[t]))
        for t in range(T)
    ]
    shortage = [pulp.LpVariable(f"short_{t}", lowBound=0) for t in range(T)]

    # TODO:
    # 1. Enforce aggregate regular budget: sum(regular) <= total_cap
    # 2. Enforce positive-part shortage: shortage[t] >= demands[t] - regular[t] for each t
    # 3. Minimize regular + overtime penalty costs, call prob.solve(pulp.HiGHS(msg=False)),
    #    and return {"regular": ..., "shortage": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
