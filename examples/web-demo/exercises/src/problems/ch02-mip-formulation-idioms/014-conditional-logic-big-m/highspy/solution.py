import pulp


def solve(input_data: dict) -> dict:
    """Return {"active": list[int], "levels": list[float], "netProfit": float}."""
    budget = input_data["budget"]
    unit_returns = input_data["unitReturns"]
    fixed_costs = input_data["fixedCosts"]
    min_levels = input_data["minLevels"]
    max_levels = input_data["maxLevels"]
    prerequisites = input_data["prerequisites"]
    conjunctions = input_data["conjunctions"]
    conflicts = input_data["conflicts"]
    n = len(unit_returns)

    prob = pulp.LpProblem("conditional_logic_big_m", pulp.LpMaximize)
    active = [pulp.LpVariable(f"act_{i}", cat=pulp.LpBinary) for i in range(n)]
    levels = [pulp.LpVariable(f"lvl_{i}", lowBound=0) for i in range(n)]

    for i in range(n):
        prob += min_levels[i] * active[i] <= levels[i]
        prob += levels[i] <= max_levels[i] * active[i]
    prob += pulp.lpSum(levels) <= budget
    for a, b in prerequisites:
        prob += active[a] <= active[b]
    for a, b, c in conjunctions:
        prob += active[a] + active[b] - 1 <= active[c]
    for u, v in conflicts:
        prob += active[u] + active[v] <= 1

    prob += pulp.lpDot(unit_returns, levels) - pulp.lpDot(fixed_costs, active)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "active": [round(pulp.value(v)) for v in active],
        "levels": [float(pulp.value(v)) for v in levels],
        "netProfit": float(pulp.value(prob.objective)),
    }
