import pulp


def solve(
    durations,
    scores,
    compatible,
    num_slots,
    regular_length,
    max_overtime,
    overtime_cost,
) -> dict:
    """Return {"assigned_venue": list[int], "assigned_slot": list[int], "overtime": list[list[float]], "net_score": float}."""
    # TODO: Build and solve the e-sports venue scheduling model, then return the output.
    raise NotImplementedError("Not implemented")
