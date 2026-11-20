import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignedStaff": list[int], "assignedSlot": list[int], "overtime": list[float], "totalCost": float}."""
    certified = input_data["certified"]
    equip_needs = input_data["equipNeeds"]
    equip_cap = input_data["equipCap"]
    slot_penalties = input_data["slotPenalties"]
    staff_costs = input_data["staffCosts"]
    reg_limits = input_data["regularLimits"]
    max_limits = input_data["maxLimits"]
    ot_costs = input_data["overtimeCosts"]
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

    # TODO:
    # 1. Assign each job j to exactly 1 certified (staff i, slot t)
    # 2. Enforce at most 1 job per (staff i, slot t) and shared equip_needs <= equip_cap per slot t
    # 3. Enforce workload <= max_limits[i] and overtime[i] >= work[i] - reg_limits[i]
    # 4. Minimize total cost + overtime + slot penalties, solve with pulp.HiGHS(msg=False), and return output
    raise NotImplementedError("Not implemented")
