import pulp


def solve(input_data: dict) -> dict:
    """Return {"openPlants": list[int], "openDcs": list[int], "plantToDc": list[list[float]], "dcToCustomer": list[list[float]], "totalCost": float}."""
    plant_fixed = input_data["plantFixedCosts"]
    plant_caps = input_data["plantCaps"]
    dc_fixed = input_data["dcFixedCosts"]
    dc_caps = input_data["dcCaps"]
    demands = input_data["demands"]
    p2d_costs = input_data["plantDcCosts"]
    d2c_costs = input_data["dcCustomerCosts"]
    n_plants = len(plant_caps)
    n_dcs = len(dc_caps)
    n_custs = len(demands)

    prob = pulp.LpProblem("multi_echelon_scm", pulp.LpMinimize)

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

    for p in range(n_plants):
        prob += pulp.lpSum(plant_to_dc[p]) <= plant_caps[p] * open_plants[p]

    for d in range(n_dcs):
        inflow = pulp.lpSum(plant_to_dc[p][d] for p in range(n_plants))
        outflow = pulp.lpSum(dc_to_cust[d])
        prob += inflow <= dc_caps[d] * open_dcs[d]
        prob += inflow == outflow

    for c in range(n_custs):
        prob += pulp.lpSum(dc_to_cust[d][c] for d in range(n_dcs)) >= demands[c]

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
        "openPlants": [round(pulp.value(v)) for v in open_plants],
        "openDcs": [round(pulp.value(v)) for v in open_dcs],
        "plantToDc": [[float(pulp.value(v)) for v in row] for row in plant_to_dc],
        "dcToCustomer": [[float(pulp.value(v)) for v in row] for row in dc_to_cust],
        "totalCost": float(pulp.value(prob.objective)),
    }
