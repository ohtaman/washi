import pulp


def solve(
    demands,
    min_regular,
    max_regular,
    regular_costs,
    overtime_penalties,
    total_regular_cap,
) -> dict:
    """Return {"regular": list[float], "shortage": list[float], "total_cost": float}."""
    min_reg = min_regular
    max_reg = max_regular
    reg_costs = regular_costs
    penalties = overtime_penalties
    total_cap = total_regular_cap
    T = len(demands)

    prob = pulp.LpProblem("positive_part_overtime", pulp.LpMinimize)

    # Decision variables: regular[t] in [min_reg[t], max_reg[t]] and auxiliary shortage[t] >= 0.
    regular = [
        pulp.LpVariable(f"reg_{t}", lowBound=float(min_reg[t]), upBound=float(max_reg[t]))
        for t in range(T)
    ]
    shortage = [pulp.LpVariable(f"short_{t}", lowBound=0) for t in range(T)]

    # Total regular-time cap, plus positive-part linearization shortage[t] = max(0, demand[t] - regular[t]).
    prob += pulp.lpSum(regular) <= total_cap
    for t in range(T):
        prob += shortage[t] >= demands[t] - regular[t]

    # Objective: minimize total regular production cost plus overtime shortage penalties.
    prob += pulp.lpDot(reg_costs, regular) + pulp.lpDot(penalties, shortage)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "regular": [float(pulp.value(v)) for v in regular],
        "shortage": [float(pulp.value(v)) for v in shortage],
        "total_cost": float(pulp.value(prob.objective)),
    }
