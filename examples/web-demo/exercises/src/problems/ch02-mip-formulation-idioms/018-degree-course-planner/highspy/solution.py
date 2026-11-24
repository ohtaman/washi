import pulp


def solve(interest, requirements, caps, prerequisites, time_conflicts) -> dict:
    """Return {"take": list[int], "total_interest": float}."""
    n = len(interest)

    prob = pulp.LpProblem("degree_course_planner", pulp.LpMaximize)
    # Decision variables: binary take[j] = 1 if course j is taken.
    take = [pulp.LpVariable(f"course_{j}", cat=pulp.LpBinary) for j in range(n)]

    # Resource/credit caps, prerequisite implications (course => prereq), and time-slot conflicts.
    for k, cap in enumerate(caps):
        prob += pulp.lpDot(requirements[k], take) <= cap
    for prereq, course in prerequisites:
        prob += take[course] <= take[prereq]
    for a, b in time_conflicts:
        prob += take[a] + take[b] <= 1

    # Objective: maximize total interest score of selected courses.
    prob += pulp.lpDot(interest, take)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "take": [round(pulp.value(v)) for v in take],
        "total_interest": float(pulp.value(prob.objective)),
    }
