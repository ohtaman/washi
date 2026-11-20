import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignedRoom": list[int], "assignedSession": list[int], "overtime": list[list[float]], "netScore": float}."""
    durations = input_data["durations"]
    priorities = input_data["priorities"]
    compatible = input_data["compatible"]
    num_sessions = input_data["numSessions"]
    reg_cap = input_data["regularCapacity"]
    max_ot = input_data["maxOvertime"]
    ot_cost = input_data["overtimeCost"]
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

    # TODO:
    # 1. Assign each case at most once, and force x[c][r][s] == 0 when compatible[c][r] == 0
    # 2. Enforce sum_c durations[c] * x[c][r][s] <= reg_cap + overtime[r][s] for each (r, s)
    # 3. Maximize total priority - ot_cost * sum(overtime), solve with pulp.HiGHS(msg=False), and decode output
    raise NotImplementedError("Not implemented")
