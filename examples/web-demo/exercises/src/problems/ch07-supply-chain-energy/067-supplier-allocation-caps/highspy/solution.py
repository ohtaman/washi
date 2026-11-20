import pulp


def solve(input_data: dict) -> dict:
    """Return {"active": list[int], "allocations": list[list[float]], "totalCost": float}."""
    demands = input_data["demands"]
    unit_costs = input_data["unitCosts"]
    fixed_costs = input_data["fixedCosts"]
    min_orders = input_data["minOrders"]
    max_orders = input_data["maxOrders"]
    max_share = input_data["maxShare"]
    min_suppliers = input_data["minSuppliers"]
    max_suppliers = input_data["maxSuppliers"]
    n_sup = len(fixed_costs)
    n_plants = len(demands)

    prob = pulp.LpProblem("supplier_allocation_caps", pulp.LpMinimize)

    active = [pulp.LpVariable(f"y_{s}", cat=pulp.LpBinary) for s in range(n_sup)]
    allocations = [
        [
            pulp.LpVariable(f"q_{s}_{p}", lowBound=0, upBound=max_share * demands[p])
            for p in range(n_plants)
        ]
        for s in range(n_sup)
    ]

    prob += pulp.lpSum(active) >= min_suppliers
    prob += pulp.lpSum(active) <= max_suppliers

    for s in range(n_sup):
        total_order = pulp.lpSum(allocations[s])
        prob += total_order >= min_orders[s] * active[s]
        prob += total_order <= max_orders[s] * active[s]

    for p in range(n_plants):
        prob += pulp.lpSum(allocations[s][p] for s in range(n_sup)) >= demands[p]

    prob += pulp.lpDot(fixed_costs, active) + pulp.lpSum(
        unit_costs[s][p] * allocations[s][p]
        for s in range(n_sup)
        for p in range(n_plants)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "active": [round(pulp.value(v)) for v in active],
        "allocations": [[float(pulp.value(v)) for v in row] for row in allocations],
        "totalCost": float(pulp.value(prob.objective)),
    }
