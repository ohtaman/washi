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

    # TODO:
    # 1. Enforce plant capacities, DC capacities, DC flow conservation, and customer demands
    # 2. Minimize fixed + shipping costs, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
