import pulp


def solve(input_data: dict) -> dict:
    """Return {"take": list[int], "totalInterest": float}."""
    interest = input_data["interest"]
    requirements = input_data["requirements"]
    caps = input_data["caps"]
    prerequisites = input_data["prerequisites"]
    time_conflicts = input_data["timeConflicts"]
    n = len(interest)

    prob = pulp.LpProblem("degree_course_planner", pulp.LpMaximize)
    take = [pulp.LpVariable(f"course_{j}", cat=pulp.LpBinary) for j in range(n)]

    # TODO: Enforce category caps, prerequisites, and time conflicts, maximize total interest, and return the result.
    raise NotImplementedError("Not implemented")
