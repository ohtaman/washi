import highspy


def solve(input_data: dict) -> dict:
    base_margins = input_data["baseMargins"]
    cand_margins = input_data["candidateMargins"]
    usages = input_data["usages"]
    capacities = input_data["capacities"]
    B = len(base_margins)
    C = len(cand_margins)
    all_margins = list(base_margins) + list(cand_margins)
    N = B + C

    h = highspy.Highs()
    h.silent()

    x = [h.addVariable(lb=0.0, name=f"x_{j}") for j in range(N)]
    constrs = [
        h.addConstr(h.qsum(usages[k][j] * x[j] for j in range(N)) <= cap)
        for k, cap in enumerate(capacities)
    ]

    h.maximize(h.qsum(all_margins[j] * x[j] for j in range(N)))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    sol = h.getSolution()
    clean = lambda v: 0.0 if abs(v) < 1e-9 else float(v)
    shadow_prices = [clean(sol.row_dual[c.index]) for c in constrs]
    cand_rc = [clean(sol.col_dual[v.index]) for v in x[B:]]

    return {
        "baseQuantities": [float(h.val(v)) for v in x[:B]],
        "candidateQuantities": [float(h.val(v)) for v in x[B:]],
        "optimalProfit": float(h.getObjectiveValue()),
        "shadowPrices": shadow_prices,
        "candidateReducedCosts": cand_rc,
        "minMarginIncreaseNeeded": [clean(max(0.0, -rc)) for rc in cand_rc],
    }
