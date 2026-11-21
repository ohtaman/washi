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
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "charge": list[float], "discharge": list[float], "soc": list[float], "peakLoad": float, "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
