import pulp


def solve(interest, requirements, caps, prerequisites, time_conflicts) -> dict:
    """Return {"take": list[int], "totalInterest": float}."""
    n = len(interest)

    prob = pulp.LpProblem("degree_course_planner", pulp.LpMaximize)
    take = [pulp.LpVariable(f"course_{j}", cat=pulp.LpBinary) for j in range(n)]

    for k, cap in enumerate(caps):
        prob += pulp.lpDot(requirements[k], take) <= cap
    for prereq, course in prerequisites:
        prob += take[course] <= take[prereq]
    for a, b in time_conflicts:
        prob += take[a] + take[b] <= 1

    prob += pulp.lpDot(interest, take)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "take": [round(pulp.value(v)) for v in take],
        "totalInterest": float(pulp.value(prob.objective)),
    }
