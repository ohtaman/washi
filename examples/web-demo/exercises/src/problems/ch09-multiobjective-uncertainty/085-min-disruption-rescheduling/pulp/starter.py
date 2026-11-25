import pulp


def solve(
    baseline,
    unavailable,
    demands,
    max_shifts,
    worker_costs,
    disruption_weight,
) -> dict:
    """Return {"schedule": list[list[int]], "hamming_distance": int, "total_objective": float}."""
    # TODO: Build and solve the minimum-disruption rescheduling MIP, then return the output.
    raise NotImplementedError("Not implemented")
