import pulp


def solve(input_data: dict) -> dict:
    """Return {"selectedNodes": list[int], "selectedEdges": list[int], "netValue": float}."""
    prizes = input_data["prizes"]
    edges = input_data["edges"]
    n = len(prizes)
    m = len(edges)

    prob = pulp.LpProblem("flow_connectivity", pulp.LpMaximize)
    y = [pulp.LpVariable(f"y_{v}", cat=pulp.LpBinary) for v in range(n)]
    w = [pulp.LpVariable(f"w_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_fwd = [pulp.LpVariable(f"zf_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_rev = [pulp.LpVariable(f"zr_{e}", cat=pulp.LpBinary) for e in range(m)]
    f_fwd = [pulp.LpVariable(f"ff_{e}", lowBound=0, upBound=n - 1) for e in range(m)]
    f_rev = [pulp.LpVariable(f"fr_{e}", lowBound=0, upBound=n - 1) for e in range(m)]

    # TODO:
    # 1. Fix root y[0] == 1
    # 2. Enforce w[e] <= y[u], w[e] <= y[v], z_fwd[e] + z_rev[e] <= w[e],
    #    f_fwd[e] <= (n - 1) * z_fwd[e], f_rev[e] <= (n - 1) * z_rev[e]
    # 3. Enforce single-commodity flow balance from root 0 so every active node receives 1 unit
    # 4. Maximize sum(prizes[v] * y[v]) - sum(cost * w[e]) and solve with `prob.solve(pulp.HiGHS(msg=False))`
    raise NotImplementedError("Not implemented")
