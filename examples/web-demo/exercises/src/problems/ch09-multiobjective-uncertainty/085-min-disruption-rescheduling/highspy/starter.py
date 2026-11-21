import pulp


def solve(
    baseline,
    unavailable,
    demands,
    maxShifts,
    workerCosts,
    disruptionWeight,
) -> dict:
    """Return {"schedule": list[list[int]], "hammingDistance": int, "totalObjective": float}."""
    # TODO: Build and solve the minimum-disruption rescheduling MIP, then return the output.
    raise NotImplementedError("Not implemented")
