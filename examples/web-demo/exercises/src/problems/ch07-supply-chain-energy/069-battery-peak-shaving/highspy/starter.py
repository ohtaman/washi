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
    """Return {"charge": list[float], "discharge": list[float], "soc": list[float], "peak_load": float, "total_cost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
