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

    prob += pulp.lpSum(regular) <= total_cap
    for t in range(T):
        prob += shortage[t] >= demands[t] - regular[t]

    prob += pulp.lpDot(reg_costs, regular) + pulp.lpDot(penalties, shortage)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "regular": [float(pulp.value(v)) for v in regular],
        "shortage": [float(pulp.value(v)) for v in shortage],
        "totalCost": float(pulp.value(prob.objective)),
    }
