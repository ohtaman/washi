import pulp


def solve(
    baseLoads,
    prices,
    demandCharge,
    capacity,
    minSoc,
    initSoc,
    minFinalSoc,
    maxPower,
    etaCharge,
    etaDischarge,
) -> dict:
    """Return {"charge": list[float], "discharge": list[float], "soc": list[float], "peakLoad": float, "totalCost": float}."""
    # TODO: Build and solve the model, then return the output.
    raise NotImplementedError("Not implemented")
