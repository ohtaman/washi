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
    reg_len = regular_length
    max_ot = max_overtime
    ot_cost = overtime_cost
    num_matches = len(durations)
    num_venues = len(compatible[0])

    prob = pulp.LpProblem("esports_venue_scheduling", pulp.LpMaximize)
    # x[m][v][s] = 1 if match m is scheduled at venue v in slot s (binary)
    # overtime[v][s]: overtime hours used at (venue v, slot s) in [0, max_ot]
    x = [
        [
            [
                pulp.LpVariable(f"x_{m}_{v}_{s}", cat=pulp.LpBinary)
                for s in range(num_slots)
            ]
            for v in range(num_venues)
        ]
        for m in range(num_matches)
    ]
    overtime = [
        [
            pulp.LpVariable(f"ot_{v}_{s}", lowBound=0, upBound=max_ot)
            for s in range(num_slots)
        ]
        for v in range(num_venues)
    ]

    # Each match is scheduled at most once and only on compatible venues
    for m in range(num_matches):
        prob += pulp.lpSum(x[m][v][s] for v in range(num_venues) for s in range(num_slots)) <= 1
        for v in range(num_venues):
            if compatible[m][v] == 0:
                prob += pulp.lpSum(x[m][v]) == 0

    # Venue-slot duration capacity: total match time <= reg_len + overtime[v][s]
    for v in range(num_venues):
        for s in range(num_slots):
            prob += (
                pulp.lpSum(durations[m] * x[m][v][s] for m in range(num_matches))
                <= reg_len + overtime[v][s]
            )

    # Objective: maximize scheduled match scores minus overtime penalty costs
    prob += pulp.lpSum(
        scores[m] * x[m][v][s]
        for m in range(num_matches)
        for v in range(num_venues)
        for s in range(num_slots)
    ) - ot_cost * pulp.lpSum(overtime[v][s] for v in range(num_venues) for s in range(num_slots))
    prob.solve(pulp.HiGHS(msg=False))

    # Extract assigned (venue, slot) per match (-1 if unscheduled), rounding binary flags
    assigned_venue = [-1] * num_matches
    assigned_slot = [-1] * num_matches
    for m in range(num_matches):
        for v in range(num_venues):
            for s in range(num_slots):
                if round(pulp.value(x[m][v][s])) == 1:
                    assigned_venue[m] = v
                    assigned_slot[m] = s

    # Clamp negative floating-point solver tolerances to 0.0
    ot_vals = [
        [max(0.0, float(pulp.value(overtime[v][s]))) for s in range(num_slots)]
        for v in range(num_venues)
    ]

    return {
        "assigned_venue": assigned_venue,
        "assigned_slot": assigned_slot,
        "overtime": ot_vals,
        "net_score": float(pulp.value(prob.objective)),
    }
