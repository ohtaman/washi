import pulp


def solve(coverage, crews, opCosts, maxCrews, targetDemand, slack) -> dict:
    """Return {"selected": list[int], "obj1": float, "obj2": float}."""
    op_costs = opCosts
    max_crews = maxCrews
    target_demand = targetDemand
    n = len(coverage)

    # Stage 1: minimize primary unmet demand shortfall
    prob1 = pulp.LpProblem("lex_stage1", pulp.LpMinimize)
    x1 = [pulp.LpVariable(f"x1_{i}", cat=pulp.LpBinary) for i in range(n)]
    shortfall1 = pulp.LpVariable("shortfall1", lowBound=0)

    prob1 += pulp.lpDot(crews, x1) <= max_crews
    prob1 += pulp.lpDot(coverage, x1) + shortfall1 >= target_demand
    prob1 += shortfall1
    prob1.solve(pulp.HiGHS(msg=False))
    best_obj1 = float(pulp.value(prob1.objective))

    # Stage 2: enforce Stage 1 tolerance and minimize secondary operating cost
    prob2 = pulp.LpProblem("lex_stage2", pulp.LpMinimize)
    x2 = [pulp.LpVariable(f"x2_{i}", cat=pulp.LpBinary) for i in range(n)]

    prob2 += pulp.lpDot(crews, x2) <= max_crews
    prob2 += pulp.lpDot(coverage, x2) >= target_demand - (best_obj1 + slack) - 1e-6
    prob2 += pulp.lpDot(op_costs, x2)
    prob2.solve(pulp.HiGHS(msg=False))

    selected = [round(pulp.value(v)) for v in x2]
    covered = sum(coverage[i] * selected[i] for i in range(n))
    return {
        "selected": selected,
        "obj1": float(max(0.0, target_demand - covered)),
        "obj2": float(pulp.value(prob2.objective)),
    }
