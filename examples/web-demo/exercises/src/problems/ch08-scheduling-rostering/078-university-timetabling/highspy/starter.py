import pulp


def solve(input_data: dict) -> dict:
    """Return {"rooms": list[int], "slots": list[int], "totalScore": float}."""
    sizes = input_data["courseSizes"]
    caps = input_data["roomCapacities"]
    teachers = input_data["teachers"]
    cohorts = input_data["cohorts"]
    scores = input_data["slotScores"]
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

    # TODO:
    # 1. Assign each course c to exactly 1 compatible (room r, slot t)
    # 2. Enforce at most 1 course per (room, slot)
    # 3. Enforce teacher and cohort conflict avoidance in every timeslot t
    # 4. Maximize total slot_scores, solve with pulp.HiGHS(msg=False), and return rooms, slots, totalScore
    raise NotImplementedError("Not implemented")
