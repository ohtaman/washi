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

    # TODO:
    # 1. Link conditional continuous ranges: min_levels[i] * active[i] <= levels[i] <= max_levels[i] * active[i]
    # 2. Add total budget constraint sum(levels) <= budget
    # 3. Linearize prerequisites, conjunctions, and conflicts on binary variables
    # 4. Maximize net profit, solve with HiGHS, and return dict
    raise NotImplementedError("Not implemented")
