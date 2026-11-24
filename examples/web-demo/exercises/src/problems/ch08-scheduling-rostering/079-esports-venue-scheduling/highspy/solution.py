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

    for m in range(num_matches):
        prob += pulp.lpSum(x[m][v][s] for v in range(num_venues) for s in range(num_slots)) <= 1
        for v in range(num_venues):
            if compatible[m][v] == 0:
                prob += pulp.lpSum(x[m][v]) == 0

    for v in range(num_venues):
        for s in range(num_slots):
            prob += (
                pulp.lpSum(durations[m] * x[m][v][s] for m in range(num_matches))
                <= reg_len + overtime[v][s]
            )

    prob += pulp.lpSum(
        scores[m] * x[m][v][s]
        for m in range(num_matches)
        for v in range(num_venues)
        for s in range(num_slots)
    ) - ot_cost * pulp.lpSum(overtime[v][s] for v in range(num_venues) for s in range(num_slots))
    prob.solve(pulp.HiGHS(msg=False))

    assigned_venue = [-1] * num_matches
    assigned_slot = [-1] * num_matches
    for m in range(num_matches):
        for v in range(num_venues):
            for s in range(num_slots):
                if round(pulp.value(x[m][v][s])) == 1:
                    assigned_venue[m] = v
                    assigned_slot[m] = s

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
