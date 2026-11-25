import pulp


def _solve_variant(fixed_costs, unit_costs, capacities, demand, relax: bool):
    n = len(fixed_costs)

    prob = pulp.LpProblem("tight_big_m", pulp.LpMinimize)
    # Relaxed LP uses continuous [0, 1] open_vars to measure the tightened LP lower bound
    cat = pulp.LpContinuous if relax else pulp.LpBinary
    open_vars = [pulp.LpVariable(f"open_{i}", lowBound=0, upBound=1, cat=cat) for i in range(n)]
    quantities = [
        pulp.LpVariable(f"qty_{i}", lowBound=0, upBound=min(capacities[i], demand))
        for i in range(n)
    ]

    # Tight Big-M linking: min(capacities[i], demand) strengthens the LP relaxation
    for i in range(n):
        tight_m = min(capacities[i], demand)
        prob += quantities[i] <= tight_m * open_vars[i]
    # Demand satisfaction and total fixed + variable cost objective
    prob += pulp.lpSum(quantities) >= demand
    prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpDot(unit_costs, quantities)

    prob.solve(pulp.HiGHS(msg=False))
    return prob, open_vars, quantities


def solve(fixed_costs, unit_costs, capacities, demand) -> dict:
    """Return {"open": list[int], "quantities": list[float], "total_cost": float, "lp_bound": float}."""
    lp_prob, _, _ = _solve_variant(fixed_costs, unit_costs, capacities, demand, relax=True)
    mip_prob, open_vars, quantities = _solve_variant(
        fixed_costs, unit_costs, capacities, demand, relax=False
    )

    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "total_cost": float(pulp.value(mip_prob.objective)),
        "lp_bound": float(pulp.value(lp_prob.objective)),
    }
