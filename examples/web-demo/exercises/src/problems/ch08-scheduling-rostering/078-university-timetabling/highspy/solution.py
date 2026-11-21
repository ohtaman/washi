import pulp


def solve(course_sizes, room_capacities, teachers, cohorts, slot_scores) -> dict:
    """Return {"rooms": list[int], "slots": list[int], "totalScore": float}."""
    sizes = course_sizes
    caps = room_capacities
    scores = slot_scores
    num_courses = len(sizes)
    num_rooms = len(caps)
    num_slots = len(scores[0])

    prob = pulp.LpProblem("university_timetabling", pulp.LpMaximize)
    x = [
        [
            [
                pulp.LpVariable(f"x_{c}_{r}_{t}", cat=pulp.LpBinary)
                for t in range(num_slots)
            ]
            for r in range(num_rooms)
        ]
        for c in range(num_courses)
    ]

    for c in range(num_courses):
        prob += pulp.lpSum(x[c][r][t] for r in range(num_rooms) for t in range(num_slots)) == 1
        for r in range(num_rooms):
            if sizes[c] > caps[r]:
                prob += pulp.lpSum(x[c][r]) == 0

    for r in range(num_rooms):
        for t in range(num_slots):
            prob += pulp.lpSum(x[c][r][t] for c in range(num_courses)) <= 1

    teacher_groups = {}
    for c, tc in enumerate(teachers):
        teacher_groups.setdefault(tc, []).append(c)
    cohort_groups = {}
    for c, c_list in enumerate(cohorts):
        for g in c_list:
            cohort_groups.setdefault(g, []).append(c)

    for group in list(teacher_groups.values()) + list(cohort_groups.values()):
        if len(group) < 2:
            continue
        for t in range(num_slots):
            prob += pulp.lpSum(x[c][r][t] for c in group for r in range(num_rooms)) <= 1

    prob += pulp.lpSum(
        scores[c][t] * x[c][r][t]
        for c in range(num_courses)
        for r in range(num_rooms)
        for t in range(num_slots)
    )
    prob.solve(pulp.HiGHS(msg=False))

    rooms = [-1] * num_courses
    slots = [-1] * num_courses
    for c in range(num_courses):
        for r in range(num_rooms):
            for t in range(num_slots):
                if round(pulp.value(x[c][r][t])) == 1:
                    rooms[c] = r
                    slots[c] = t

    return {
        "rooms": rooms,
        "slots": slots,
        "totalScore": float(pulp.value(prob.objective)),
    }
