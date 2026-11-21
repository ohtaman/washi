import pulp


def solve(
    durations,
    priorities,
    compatible,
    num_sessions,
    regular_capacity,
    max_overtime,
    overtime_cost,
) -> dict:
    """Return {"assignedRoom": list[int], "assignedSession": list[int], "overtime": list[list[float]], "netScore": float}."""
    # TODO: Build and solve the operating room allocation model, then return the output.
    raise NotImplementedError("Not implemented")
