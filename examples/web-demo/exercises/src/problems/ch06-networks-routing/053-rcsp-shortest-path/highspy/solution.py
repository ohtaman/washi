import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalCost": float}."""
    n = input_data["nodeCount"]
    s = input_data["source"]
    t = input_data["sink"]
    max_r = input_data["maxResource"]
    edges = input_data["edges"]

    prob = pulp.LpProblem("rcsp_shortest_path", pulp.LpMinimize)
    x = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(len(edges))]

    for v in range(n):
        rhs = 1 if v == s else (-1 if v == t else 0)
        out_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["from"] == v)
        in_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["to"] == v)
        prob += out_x - in_x == rhs

    prob += pulp.lpSum(e["resource"] * x[i] for i, e in enumerate(edges)) <= max_r
    prob += pulp.lpSum(e["cost"] * x[i] for i, e in enumerate(edges))
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in x],
        "totalCost": float(pulp.value(prob.objective)),
    }
