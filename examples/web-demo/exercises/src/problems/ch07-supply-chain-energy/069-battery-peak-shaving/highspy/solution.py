import pulp


def solve(
    base_loads,
    prices,
    demand_charge,
    capacity,
    min_soc,
    init_soc,
    min_final_soc,
    max_power,
    eta_charge,
    eta_discharge,
) -> dict:
    """Return {"charge": list[float], "discharge": list[float], "soc": list[float], "peakLoad": float, "totalCost": float}."""
    cap = capacity
    min_final = min_final_soc
    p_max = max_power
    eta_c = eta_charge
    eta_d = eta_discharge
    T = len(base_loads)

    prob = pulp.LpProblem("battery_peak_shaving", pulp.LpMinimize)

    charge = [pulp.LpVariable(f"chg_{t}", lowBound=0, upBound=p_max) for t in range(T)]
    discharge = [pulp.LpVariable(f"dis_{t}", lowBound=0, upBound=p_max) for t in range(T)]
    mode = [pulp.LpVariable(f"mode_{t}", cat=pulp.LpBinary) for t in range(T)]
    soc = [
        pulp.LpVariable(
            f"soc_{t}",
            lowBound=(max(min_soc, min_final) if t == T - 1 else min_soc),
            upBound=cap,
        )
        for t in range(T)
    ]
    grid_load = [pulp.LpVariable(f"grid_{t}", lowBound=0) for t in range(T)]
    peak_load = pulp.LpVariable("peakLoad", lowBound=0)

    for t in range(T):
        prev_soc = init_soc if t == 0 else soc[t - 1]
        prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
        prob += grid_load[t] == base_loads[t] + charge[t] - discharge[t]
        prob += peak_load >= grid_load[t]
        prob += charge[t] <= p_max * mode[t]
        prob += discharge[t] <= p_max * (1 - mode[t])

    prob += pulp.lpDot(prices, grid_load) + demand_charge * peak_load
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "charge": [float(pulp.value(v)) for v in charge],
        "discharge": [float(pulp.value(v)) for v in discharge],
        "soc": [float(pulp.value(v)) for v in soc],
        "peakLoad": float(pulp.value(peak_load)),
        "totalCost": float(pulp.value(prob.objective)),
    }
