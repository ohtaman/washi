import pulp


def solve(prizes, edges) -> dict:
    """Return {"selectedNodes": list[int], "selectedEdges": list[int], "netValue": float}."""
    n = len(prizes)
    m = len(edges)

    prob = pulp.LpProblem("flow_connectivity", pulp.LpMaximize)
    y = [pulp.LpVariable(f"y_{v}", cat=pulp.LpBinary) for v in range(n)]
    w = [pulp.LpVariable(f"w_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_fwd = [pulp.LpVariable(f"zf_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_rev = [pulp.LpVariable(f"zr_{e}", cat=pulp.LpBinary) for e in range(m)]
    f_fwd = [pulp.LpVariable(f"ff_{e}", lowBound=0, upBound=n - 1) for e in range(m)]
    f_rev = [pulp.LpVariable(f"fr_{e}", lowBound=0, upBound=n - 1) for e in range(m)]

    prob += y[0] == 1
    for i, e in enumerate(edges):
        prob += w[i] <= y[e["u"]]
        prob += w[i] <= y[e["v"]]
        prob += z_fwd[i] + z_rev[i] <= w[i]
        prob += f_fwd[i] <= (n - 1) * z_fwd[i]
        prob += f_rev[i] <= (n - 1) * z_rev[i]

    for v in range(n):
        in_f = pulp.lpSum(f_fwd[i] for i, e in enumerate(edges) if e["v"] == v) + pulp.lpSum(
            f_rev[i] for i, e in enumerate(edges) if e["u"] == v
        )
        out_f = pulp.lpSum(f_fwd[i] for i, e in enumerate(edges) if e["u"] == v) + pulp.lpSum(
            f_rev[i] for i, e in enumerate(edges) if e["v"] == v
        )
        if v == 0:
            prob += out_f - in_f == pulp.lpSum(y[k] for k in range(1, n))
        else:
            prob += in_f - out_f == y[v]

    prob += pulp.lpSum(prizes[v] * y[v] for v in range(n)) - pulp.lpSum(
        e["cost"] * w[i] for i, e in enumerate(edges)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selectedNodes": [round(pulp.value(v)) for v in y],
        "selectedEdges": [round(pulp.value(v)) for v in w],
        "netValue": float(pulp.value(prob.objective)),
    }
