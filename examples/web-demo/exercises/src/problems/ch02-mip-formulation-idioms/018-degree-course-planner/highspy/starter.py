import pulp


def solve(interest, requirements, caps, prerequisites, time_conflicts) -> dict:
    """Return {"take": list[int], "total_interest": float}."""
    n = len(interest)

    prob = pulp.LpProblem("degree_course_planner", pulp.LpMaximize)
    take = [pulp.LpVariable(f"course_{j}", cat=pulp.LpBinary) for j in range(n)]

    # TODO: Enforce category caps, prerequisites, and time conflicts, maximize total interest, and return the result.
    raise NotImplementedError("Not implemented")
