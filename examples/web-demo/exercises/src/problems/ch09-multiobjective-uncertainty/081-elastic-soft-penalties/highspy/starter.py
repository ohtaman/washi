import pulp


def solve(
    unit_costs,
    hours,
    targets,
    shortfall_penalties,
    excess_penalties,
    machine_cap,
    min_total,
) -> dict:
    """Return {"quantities": list[float], "shortfalls": list[float], "excesses": list[float], "total_cost": float}."""
    # TODO: Build and solve the elastic LP model, then return the output.
    raise NotImplementedError("Not implemented")
