import pulp


def solve(
    demands,
    setup_cost,
    hold_cost,
    prod_cap,
    setup_power,
    unit_power,
    base_loads,
    prices,
    demand_charge,
    battery_cap,
    init_soc,
    max_power,
    eta_charge,
    eta_discharge,
) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "charge": list[float], "discharge": list[float], "soc": list[float], "peak_load": float, "total_cost": float}."""
    bat_cap = battery_cap
    p_max = max_power
    eta_c = eta_charge
    eta_d = eta_discharge
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
    peak_load = pulp.LpVariable("peak_load", lowBound=0)

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
        "peak_load": float(pulp.value(peak_load)),
        "total_cost": float(pulp.value(prob.objective)),
    }
