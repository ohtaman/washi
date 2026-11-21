import pulp


def solve(
    durations,
    priorities,
    compatible,
    numSessions,
    regularCapacity,
    maxOvertime,
    overtimeCost,
) -> dict:
    """Return {"assignedRoom": list[int], "assignedSession": list[int], "overtime": list[list[float]], "netScore": float}."""
    # TODO: Build and solve the operating room allocation model, then return the output.
    raise NotImplementedError("Not implemented")
