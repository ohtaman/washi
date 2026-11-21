import pulp


def solve(demands, isSenior, staffSkills, skillDemands, ngPairs, shiftCosts) -> dict:
    """Return {"schedule": list[list[int]], "totalCost": float}."""
    is_senior = isSenior
    staff_skills = staffSkills
    skill_demands = skillDemands
    ng_pairs = ngPairs
    shift_costs = shiftCosts
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = len(demands[0])
    num_skills = len(staff_skills[0])

    prob = pulp.LpProblem("skill_tiers_leads_ng_pairs", pulp.LpMinimize)
    x = [
        [
            [
                pulp.LpVariable(f"x_{i}_{d}_{s}", cat=pulp.LpBinary)
                for s in range(num_shifts)
            ]
            for d in range(num_days)
        ]
        for i in range(num_staff)
    ]

    for i in range(num_staff):
        for d in range(num_days):
            prob += pulp.lpSum(x[i][d]) <= 1

    for d in range(num_days):
        for s in range(num_shifts):
            if demands[d][s] <= 0:
                continue
            col = [x[i][d][s] for i in range(num_staff)]
            prob += pulp.lpSum(col) >= demands[d][s]
            prob += pulp.lpDot(is_senior, col) >= 1
            for k in range(num_skills):
                if skill_demands[s][k] > 0:
                    prob += (
                        pulp.lpSum(staff_skills[i][k] * x[i][d][s] for i in range(num_staff))
                        >= skill_demands[s][k]
                    )

    for a, b in ng_pairs:
        for d in range(num_days):
            for s in range(num_shifts):
                prob += x[a][d][s] + x[b][d][s] <= 1

    prob += pulp.lpSum(
        shift_costs[i][s] * x[i][d][s]
        for i in range(num_staff)
        for d in range(num_days)
        for s in range(num_shifts)
    )
    prob.solve(pulp.HiGHS(msg=False))

    schedule = [
        [
            next((s for s in range(num_shifts) if round(pulp.value(x[i][d][s])) == 1), -1)
            for d in range(num_days)
        ]
        for i in range(num_staff)
    ]

    return {
        "schedule": schedule,
        "totalCost": float(pulp.value(prob.objective)),
    }
