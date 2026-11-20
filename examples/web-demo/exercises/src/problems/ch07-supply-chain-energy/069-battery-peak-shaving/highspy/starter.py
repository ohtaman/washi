import pulp


def solve(input_data: dict) -> dict:
    """Return {"charge": list[float], "discharge": list[float], "soc": list[float], "peakLoad": float, "totalCost": float}."""
    prob = pulp.LpProblem("battery_peak_shaving", pulp.LpMinimize)

    # TODO:
    # 1. Declare charge[t], discharge[t], binary mode[t], soc[t], gridLoad[t] >= 0, and peakLoad
    # 2. Enforce SOC balance with efficiencies, grid balance, charge/discharge exclusion, and peak epigraph
    # 3. Minimize TOU energy + demandCharge * peakLoad, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
