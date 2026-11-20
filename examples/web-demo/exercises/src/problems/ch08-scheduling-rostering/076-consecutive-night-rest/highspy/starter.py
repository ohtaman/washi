import pulp


def solve(input_data: dict) -> dict:
    """Return {"schedule": list[list[int]], "totalCost": float}."""
    demands = input_data["demands"]
    shift_costs = input_data["shiftCosts"]
    max_consec = input_data["maxConsecutiveDays"]
    num_staff = len(shift_costs)
    num_days = len(demands)
    num_shifts = 3  # 0: Day, 1: Evening, 2: Night

    prob = pulp.LpProblem("consecutive_night_rest", pulp.LpMinimize)
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
    # 1. Enforce max 1 shift per staff-day and daily shift coverage >= demands[d][s]
    # 2. Enforce rolling window max consecutive workdays <= max_consec
    # 3. Forbid Night (2) -> Day (0) transition: x[i][d][2] + x[i][d+1][0] <= 1
    # 4. Minimize total shift_costs, solve with pulp.HiGHS(msg=False), and decode schedule
    raise NotImplementedError("Not implemented")
