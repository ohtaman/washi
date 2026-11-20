import pulp


def solve(input_data: dict) -> dict:
    """Return {"schedule": list[list[int]], "totalCost": float}."""
    demands = input_data["demands"]
    is_senior = input_data["isSenior"]
    staff_skills = input_data["staffSkills"]
    skill_demands = input_data["skillDemands"]
    ng_pairs = input_data["ngPairs"]
    shift_costs = input_data["shiftCosts"]
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = len(demands[0])

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

    # TODO:
    # 1. Enforce max 1 shift per staff-day
    # 2. Enforce total headcount, >= 1 senior lead, and skill coverage per (d, s)
    # 3. Forbid incompatible NG pairs on the same (d, s) shift
    # 4. Minimize total shift_costs, solve with pulp.HiGHS(msg=False), and decode schedule
    raise NotImplementedError("Not implemented")
