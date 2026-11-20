import pulp


def solve(input_data: dict) -> dict:
    """Return {"schedule": list[list[int]], "totalCost": float}."""
    demands = input_data["demands"]
    shift_costs = input_data["shiftCosts"]
    min_shifts = input_data["minShifts"]
    max_shifts = input_data["maxShifts"]
    days_off = input_data["daysOff"]
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = len(demands[0])

    prob = pulp.LpProblem("shift_coverage_days_off", pulp.LpMinimize)
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
    # 1. Enforce at most 1 shift per staff-day and 0 shifts on required days_off[i]
    # 2. Enforce daily shift coverage >= demands[d][s]
    # 3. Enforce min_shifts[i] <= total shifts for staff i <= max_shifts[i]
    # 4. Minimize total shift_costs, solve with pulp.HiGHS(msg=False), and decode schedule[i][d] (-1 for Off)
    raise NotImplementedError("Not implemented")
