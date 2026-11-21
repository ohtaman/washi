import pulp


def solve(margins, fixed_costs, capacities, material_usages, material_cap) -> dict:
    """Return {"open": list[int], "quantities": list[float], "netProfit": float}."""
    mat_usages = material_usages
    mat_cap = material_cap
    n = len(margins)

    prob = pulp.LpProblem("line_activation", pulp.LpMaximize)

    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    # TODO:
    # 1. Enforce quantities[i] <= capacities[i] * open_vars[i] for each i
    # 2. Enforce shared material budget <= mat_cap
    # 3. Set objective `prob += ...` on net profit, call `prob.solve(pulp.HiGHS(msg=False))`,
    #    and return {"open": ..., "quantities": ..., "netProfit": ...}
    raise NotImplementedError("Not implemented")
