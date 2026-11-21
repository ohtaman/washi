import pulp


def solve(
    unitCosts,
    hours,
    targets,
    shortfallPenalties,
    excessPenalties,
    machineCap,
    minTotal,
) -> dict:
    """Return {"quantities": list[float], "shortfalls": list[float], "excesses": list[float], "totalCost": float}."""
    # TODO: Build and solve the elastic LP model, then return the output.
    raise NotImplementedError("Not implemented")
