import pulp


def solve(
    certified,
    equipNeeds,
    equipCap,
    slotPenalties,
    staffCosts,
    regularLimits,
    maxLimits,
    overtimeCosts,
) -> dict:
    """Return {"assignedStaff": list[int], "assignedSlot": list[int], "overtime": list[float], "totalCost": float}."""
    equip_needs = equipNeeds
    equip_cap = equipCap
    slot_penalties = slotPenalties
    staff_costs = staffCosts
    reg_limits = regularLimits
    max_limits = maxLimits
    ot_costs = overtimeCosts
    num_staff = len(certified)
    num_jobs = len(equip_needs)
    num_slots = len(slot_penalties[0])

    prob = pulp.LpProblem("integrated_staff_equipment", pulp.LpMinimize)
    x = [
        [
            [
                pulp.LpVariable(f"x_{j}_{i}_{t}", cat=pulp.LpBinary)
                for t in range(num_slots)
            ]
            for i in range(num_staff)
        ]
        for j in range(num_jobs)
    ]
    overtime = [
        pulp.LpVariable(f"ot_{i}", lowBound=0, upBound=max_limits[i])
        for i in range(num_staff)
    ]

    for j in range(num_jobs):
        prob += pulp.lpSum(x[j][i][t] for i in range(num_staff) for t in range(num_slots)) == 1
        for i in range(num_staff):
            if certified[i][j] == 0:
                prob += pulp.lpSum(x[j][i]) == 0

    for i in range(num_staff):
        for t in range(num_slots):
            prob += pulp.lpSum(x[j][i][t] for j in range(num_jobs)) <= 1
        staff_load = pulp.lpSum(x[j][i][t] for j in range(num_jobs) for t in range(num_slots))
        prob += staff_load <= max_limits[i]
        prob += overtime[i] >= staff_load - reg_limits[i]

    for t in range(num_slots):
        prob += (
            pulp.lpSum(equip_needs[j] * x[j][i][t] for j in range(num_jobs) for i in range(num_staff))
            <= equip_cap
        )

    prob += pulp.lpSum(
        (staff_costs[i] + slot_penalties[j][t]) * x[j][i][t]
        for j in range(num_jobs)
        for i in range(num_staff)
        for t in range(num_slots)
    ) + pulp.lpDot(ot_costs, overtime)
    prob.solve(pulp.HiGHS(msg=False))

    assigned_staff = [-1] * num_jobs
    assigned_slot = [-1] * num_jobs
    for j in range(num_jobs):
        for i in range(num_staff):
            for t in range(num_slots):
                if round(pulp.value(x[j][i][t])) == 1:
                    assigned_staff[j] = i
                    assigned_slot[j] = t

    return {
        "assignedStaff": assigned_staff,
        "assignedSlot": assigned_slot,
        "overtime": [max(0.0, float(pulp.value(v))) for v in overtime],
        "totalCost": float(pulp.value(prob.objective)),
    }
