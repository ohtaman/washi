import pulp


def solve(input_data: dict) -> dict:
    """Return {"territories": list[dict], "totalCost": float}."""
    num_t = input_data["numTerritories"]
    demands = input_data["demands"]
    min_d, max_d = input_data["demandBounds"]
    hub_costs = input_data["hubCosts"]
    adj_edges = input_data["adjEdges"]
    dist = input_data["dist"]
    n = len(demands)

    prob = pulp.LpProblem("connected_territory_routing", pulp.LpMinimize)
    y = [[pulp.LpVariable(f"y_{i}_{k}", cat=pulp.LpBinary) for k in range(num_t)] for i in range(n)]
    h = [[pulp.LpVariable(f"h_{i}_{k}", cat=pulp.LpBinary) for k in range(num_t)] for i in range(n)]
    s = [[pulp.LpVariable(f"s_{i}_{k}", lowBound=0, upBound=n) for k in range(num_t)] for i in range(n)]
    f = [
        [[pulp.LpVariable(f"f_{e}_{d}_{k}", lowBound=0, upBound=n - 1) for k in range(num_t)] for d in range(2)]
        for e in range(len(adj_edges))
    ]
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [pulp.LpVariable(f"u_{i}", lowBound=0, upBound=n - 1) for i in range(n)]

    # TODO:
    # 1. Partition nodes into num_t territories, choose 1 hub per territory, and enforce demandBounds
    # 2. Add single-commodity flow connectivity along adj_edges from each territory's chosen hub
    # 3. Enforce intra-territory TSP tours with same-territory arc constraints and hub-anchored MTZ
    # 4. Minimize hub costs + tour distances, solve with `prob.solve(pulp.HiGHS(msg=False))`, and return result
    raise NotImplementedError("Not implemented")
