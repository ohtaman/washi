import pulp


def solve(
    budget,
    unit_returns,
    fixed_costs,
    min_levels,
    max_levels,
    prerequisites,
    conjunctions,
    conflicts,
) -> dict:
    """Return {"active": list[int], "levels": list[float], "netProfit": float}."""
    n = len(unit_returns)

    prob = pulp.LpProblem("conditional_logic_big_m", pulp.LpMaximize)
    active = [pulp.LpVariable(f"act_{i}", cat=pulp.LpBinary) for i in range(n)]
    levels = [pulp.LpVariable(f"lvl_{i}", lowBound=0) for i in range(n)]

    # TODO: Link conditional operating ranges, enforce budget and logical rules, maximize net profit, and return the result.
    raise NotImplementedError("Not implemented")
