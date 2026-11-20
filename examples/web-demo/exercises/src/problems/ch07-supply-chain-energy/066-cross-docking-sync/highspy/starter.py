import pulp


def solve(input_data: dict) -> dict:
    """Return {"inDoor": list[int], "outDoor": list[int], "flows": list[list[list[float]]], "departures": list[float], "totalCost": float}."""
    prob = pulp.LpProblem("cross_docking_sync", pulp.LpMinimize)

    # TODO:
    # 1. Assign each inbound/outbound truck to a single door within door capacities
    # 2. Match commodity flows between inbound supplies and outbound demands
    # 3. Disaggregate door-pair handling flows and enforce departure-time synchronization
    # 4. Minimize handling + tardiness cost, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
