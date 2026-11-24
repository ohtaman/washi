import pulp


def solve(prizes, edges) -> dict:
    """Return {"selected_nodes": list[int], "selected_edges": list[int], "net_value": float}."""
    n = len(prizes)
    m = len(edges)

    prob = pulp.LpProblem("flow_connectivity", pulp.LpMaximize)
    # y[v]: binary node selection; w[e]: binary edge purchase
    # z_fwd/z_rev: directed orientation indicators; f_fwd/f_rev: connectivity flow in [0, n-1]
    y = [pulp.LpVariable(f"y_{v}", cat=pulp.LpBinary) for v in range(n)]
    w = [pulp.LpVariable(f"w_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_fwd = [pulp.LpVariable(f"zf_{e}", cat=pulp.LpBinary) for e in range(m)]
    z_rev = [pulp.LpVariable(f"zr_{e}", cat=pulp.LpBinary) for e in range(m)]
    f_fwd = [pulp.LpVariable(f"ff_{e}", lowBound=0, upBound=n - 1) for e in range(m)]
    f_rev = [pulp.LpVariable(f"fr_{e}", lowBound=0, upBound=n - 1) for e in range(m)]

    # Anchor connected subgraph at root node 0
    prob += y[0] == 1
    # Edge activation and flow capacity coupling (at most one active flow direction per purchased edge)
    for i, e in enumerate(edges):
        prob += w[i] <= y[e["u"]]
        prob += w[i] <= y[e["v"]]
        prob += z_fwd[i] + z_rev[i] <= w[i]
        prob += f_fwd[i] <= (n - 1) * z_fwd[i]
        prob += f_rev[i] <= (n - 1) * z_rev[i]

    # Single-commodity flow conservation: root 0 sends 1 unit to every other selected node
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

    # Maximize net value: selected node prizes minus edge purchase costs
    prob += pulp.lpSum(prizes[v] * y[v] for v in range(n)) - pulp.lpSum(
        e["cost"] * w[i] for i, e in enumerate(edges)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to clean integers
    return {
        "selected_nodes": [round(pulp.value(v)) for v in y],
        "selected_edges": [round(pulp.value(v)) for v in w],
        "net_value": float(pulp.value(prob.objective)),
    }
