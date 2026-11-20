import pulp


def solve(input_data: dict) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    dist = input_data["dist"]
    reqs = input_data["requests"]
    cap = input_data["capacity"]
    max_v = input_data["maxVehicles"]
    max_stops = input_data["maxStopsPerVehicle"]
    n = len(dist)

    prob = pulp.LpProblem("pickup_delivery", pulp.LpMinimize)
    x = [
        [
            [pulp.LpVariable(f"x_{i}_{j}_{k}", cat=pulp.LpBinary) if i != j else None for k in range(max_v)]
            for j in range(n)
        ]
        for i in range(n)
    ]
    t = [
        pulp.LpVariable(
            f"t_{i}",
            lowBound=0 if i == 0 else 1,
            upBound=0 if i == 0 else n - 1,
            cat=pulp.LpContinuous,
        )
        for i in range(n)
    ]

    # TODO:
    # 1. Enforce each non-depot stop visited once, flow conservation per vehicle, and stops <= max_stops
    # 2. Enforce same-route pairing and precedence t[pickup] + 1 <= t[delivery]
    # 3. Track cumulative vehicle load L[i] in [0, cap] and minimize total route distance
    raise NotImplementedError("Not implemented")
