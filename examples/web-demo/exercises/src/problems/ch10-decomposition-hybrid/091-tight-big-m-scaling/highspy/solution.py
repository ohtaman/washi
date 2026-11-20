import pulp


def _solve_variant(input_data: dict, relax: bool):
    fixed_costs = input_data["fixedCosts"]
    unit_costs = input_data["unitCosts"]
    capacities = input_data["capacities"]
    demand = input_data["demand"]
    n = len(fixed_costs)

    prob = pulp.LpProblem("tight_big_m", pulp.LpMinimize)
    cat = pulp.LpContinuous if relax else pulp.LpBinary
    open_vars = [pulp.LpVariable(f"open_{i}", lowBound=0, upBound=1, cat=cat) for i in range(n)]
    quantities = [
        pulp.LpVariable(f"qty_{i}", lowBound=0, upBound=min(capacities[i], demand))
        for i in range(n)
    ]

    for i in range(n):
        tight_m = min(capacities[i], demand)
        prob += quantities[i] <= tight_m * open_vars[i]
    prob += pulp.lpSum(quantities) >= demand
    prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpDot(unit_costs, quantities)

    prob.solve(pulp.HiGHS(msg=False))
    return prob, open_vars, quantities


def solve(input_data: dict) -> dict:
    """Return {"open": list[int], "quantities": list[float], "totalCost": float, "lpBound": float}."""
    lp_prob, _, _ = _solve_variant(input_data, relax=True)
    mip_prob, open_vars, quantities = _solve_variant(input_data, relax=False)

    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "totalCost": float(pulp.value(mip_prob.objective)),
        "lpBound": float(pulp.value(lp_prob.objective)),
    }
