import pulp


def solve(
    plant_fixed_costs,
    plant_caps,
    dc_fixed_costs,
    dc_caps,
    demands,
    plant_dc_costs,
    dc_customer_costs,
) -> dict:
    """Return {"open_plants": list[int], "open_dcs": list[int], "plant_to_dc": list[list[float]], "dc_to_customer": list[list[float]], "total_cost": float}."""
    plant_fixed = plant_fixed_costs
    dc_fixed = dc_fixed_costs
    p2d_costs = plant_dc_costs
    d2c_costs = dc_customer_costs
    n_plants = len(plant_caps)
    n_dcs = len(dc_caps)
    n_custs = len(demands)

    prob = pulp.LpProblem("multi_echelon_scm", pulp.LpMinimize)

    # open_plants[p], open_dcs[d]: binary facility-opening decisions
    # plant_to_dc[p][d], dc_to_cust[d][c]: non-negative continuous shipment flows
    open_plants = [pulp.LpVariable(f"plant_{p}", cat=pulp.LpBinary) for p in range(n_plants)]
    open_dcs = [pulp.LpVariable(f"dc_{d}", cat=pulp.LpBinary) for d in range(n_dcs)]
    plant_to_dc = [
        [pulp.LpVariable(f"p2d_{p}_{d}", lowBound=0) for d in range(n_dcs)]
        for p in range(n_plants)
    ]
    dc_to_cust = [
        [pulp.LpVariable(f"d2c_{d}_{c}", lowBound=0) for c in range(n_custs)]
        for d in range(n_dcs)
    ]

    # Plant capacity linking: shipments require the plant to be open
    for p in range(n_plants):
        prob += pulp.lpSum(plant_to_dc[p]) <= plant_caps[p] * open_plants[p]

    # DC throughput capacity linking and flow conservation (inflow == outflow)
    for d in range(n_dcs):
        inflow = pulp.lpSum(plant_to_dc[p][d] for p in range(n_plants))
        outflow = pulp.lpSum(dc_to_cust[d])
        prob += inflow <= dc_caps[d] * open_dcs[d]
        prob += inflow == outflow

    # Customer demand satisfaction
    for c in range(n_custs):
        prob += pulp.lpSum(dc_to_cust[d][c] for d in range(n_dcs)) >= demands[c]

    # Objective: minimize fixed opening costs plus plant-to-DC and DC-to-customer transport costs
    prob += (
        pulp.lpDot(plant_fixed, open_plants)
        + pulp.lpDot(dc_fixed, open_dcs)
        + pulp.lpSum(
            p2d_costs[p][d] * plant_to_dc[p][d]
            for p in range(n_plants)
            for d in range(n_dcs)
        )
        + pulp.lpSum(
            d2c_costs[d][c] * dc_to_cust[d][c]
            for d in range(n_dcs)
            for c in range(n_custs)
        )
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        # Round binary values to eliminate floating-point solver tolerance noise
        "open_plants": [round(pulp.value(v)) for v in open_plants],
        "open_dcs": [round(pulp.value(v)) for v in open_dcs],
        "plant_to_dc": [[float(pulp.value(v)) for v in row] for row in plant_to_dc],
        "dc_to_customer": [[float(pulp.value(v)) for v in row] for row in dc_to_cust],
        "total_cost": float(pulp.value(prob.objective)),
    }
