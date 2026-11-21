import pulp


def solve(
    demands,
    setupCost,
    holdCost,
    prodCap,
    setupPower,
    unitPower,
    baseLoads,
    prices,
    demandCharge,
    batteryCap,
    initSoc,
    maxPower,
    etaCharge,
    etaDischarge,
) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "charge": list[float], "discharge": list[float], "soc": list[float], "peakLoad": float, "totalCost": float}."""
    setup_cost = setupCost
    hold_cost = holdCost
    prod_cap = prodCap
    setup_power = setupPower
    unit_power = unitPower
    base_loads = baseLoads
    demand_charge = demandCharge
    bat_cap = batteryCap
    init_soc = initSoc
    p_max = maxPower
    eta_c = etaCharge
    eta_d = etaDischarge
    T = len(demands)

    prob = pulp.LpProblem("energy_coupled_scm", pulp.LpMinimize)

    setups = [pulp.LpVariable(f"y_{t}", cat=pulp.LpBinary) for t in range(T)]
    production = [pulp.LpVariable(f"x_{t}", lowBound=0, upBound=prod_cap) for t in range(T)]
    inventory = [pulp.LpVariable(f"inv_{t}", lowBound=0) for t in range(T)]
    charge = [pulp.LpVariable(f"chg_{t}", lowBound=0, upBound=p_max) for t in range(T)]
    discharge = [pulp.LpVariable(f"dis_{t}", lowBound=0, upBound=p_max) for t in range(T)]
    mode = [pulp.LpVariable(f"mode_{t}", cat=pulp.LpBinary) for t in range(T)]
    soc = [
        pulp.LpVariable(f"soc_{t}", lowBound=(init_soc if t == T - 1 else 0), upBound=bat_cap)
        for t in range(T)
    ]
    grid_load = [pulp.LpVariable(f"grid_{t}", lowBound=0) for t in range(T)]
    peak_load = pulp.LpVariable("peakLoad", lowBound=0)

    for t in range(T):
        prev_inv = 0 if t == 0 else inventory[t - 1]
        prob += production[t] <= prod_cap * setups[t]
        prob += prev_inv + production[t] - inventory[t] == demands[t]

        prev_soc = init_soc if t == 0 else soc[t - 1]
        prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
        prob += (
            grid_load[t]
            == base_loads[t]
            + setup_power * setups[t]
            + unit_power * production[t]
            + charge[t]
            - discharge[t]
        )
        prob += peak_load >= grid_load[t]
        prob += charge[t] <= p_max * mode[t]
        prob += discharge[t] <= p_max * (1 - mode[t])

    prob += (
        setup_cost * pulp.lpSum(setups)
        + hold_cost * pulp.lpSum(inventory)
        + pulp.lpDot(prices, grid_load)
        + demand_charge * peak_load
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "setups": [round(pulp.value(v)) for v in setups],
        "production": [float(pulp.value(v)) for v in production],
        "inventory": [float(pulp.value(v)) for v in inventory],
        "charge": [float(pulp.value(v)) for v in charge],
        "discharge": [float(pulp.value(v)) for v in discharge],
        "soc": [float(pulp.value(v)) for v in soc],
        "peakLoad": float(pulp.value(peak_load)),
        "totalCost": float(pulp.value(prob.objective)),
    }
