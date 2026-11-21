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
    num_sessions = numSessions
    reg_cap = regularCapacity
    max_ot = maxOvertime
    ot_cost = overtimeCost
    num_cases = len(durations)
    num_rooms = len(compatible[0])

    prob = pulp.LpProblem("operating_room_allocation", pulp.LpMaximize)
    x = [
        [
            [
                pulp.LpVariable(f"x_{c}_{r}_{s}", cat=pulp.LpBinary)
                for s in range(num_sessions)
            ]
            for r in range(num_rooms)
        ]
        for c in range(num_cases)
    ]
    overtime = [
        [
            pulp.LpVariable(f"ot_{r}_{s}", lowBound=0, upBound=max_ot)
            for s in range(num_sessions)
        ]
        for r in range(num_rooms)
    ]

    for c in range(num_cases):
        prob += pulp.lpSum(x[c][r][s] for r in range(num_rooms) for s in range(num_sessions)) <= 1
        for r in range(num_rooms):
            if compatible[c][r] == 0:
                prob += pulp.lpSum(x[c][r]) == 0

    for r in range(num_rooms):
        for s in range(num_sessions):
            prob += (
                pulp.lpSum(durations[c] * x[c][r][s] for c in range(num_cases))
                <= reg_cap + overtime[r][s]
            )

    prob += pulp.lpSum(
        priorities[c] * x[c][r][s]
        for c in range(num_cases)
        for r in range(num_rooms)
        for s in range(num_sessions)
    ) - ot_cost * pulp.lpSum(overtime[r][s] for r in range(num_rooms) for s in range(num_sessions))
    prob.solve(pulp.HiGHS(msg=False))

    assigned_room = [-1] * num_cases
    assigned_session = [-1] * num_cases
    for c in range(num_cases):
        for r in range(num_rooms):
            for s in range(num_sessions):
                if round(pulp.value(x[c][r][s])) == 1:
                    assigned_room[c] = r
                    assigned_session[c] = s

    ot_vals = [
        [max(0.0, float(pulp.value(overtime[r][s]))) for s in range(num_sessions)]
        for r in range(num_rooms)
    ]

    return {
        "assignedRoom": assigned_room,
        "assignedSession": assigned_session,
        "overtime": ot_vals,
        "netScore": float(pulp.value(prob.objective)),
    }
