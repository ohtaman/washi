import pulp


def _solve_window(
    demands,
    setupCosts,
    prodCosts,
    holdCost,
    capacities,
    fixed_setups: list[int],
    win_start: int,
    win_end: int,
):
    n_periods = len(demands)

    prob = pulp.LpProblem("lot_sizing_window", pulp.LpMinimize)
    y = []
    for t in range(n_periods):
        if win_start <= t < win_end:
            y.append(pulp.LpVariable(f"y_{t}", cat=pulp.LpBinary))
        else:
            y.append(
                pulp.LpVariable(
                    f"y_{t}",
                    lowBound=fixed_setups[t],
                    upBound=fixed_setups[t],
                    cat=pulp.LpInteger,
                )
            )
    p = [pulp.LpVariable(f"p_{t}", lowBound=0, upBound=capacities[t]) for t in range(n_periods)]
    inv = [pulp.LpVariable(f"inv_{t}", lowBound=0) for t in range(n_periods)]

    prob += (
        pulp.lpDot(setupCosts, y)
        + pulp.lpDot(prodCosts, p)
        + holdCost * pulp.lpSum(inv)
    )

    for t in range(n_periods):
        prob += p[t] <= capacities[t] * y[t]
        if t == 0:
            prob += p[0] - inv[0] == demands[0]
        else:
            prob += inv[t - 1] + p[t] - inv[t] == demands[t]

    status = prob.solve(pulp.HiGHS(msg=False))
    if pulp.LpStatus[status] != "Optimal":
        return None

    return {
        "setups": [round(pulp.value(v)) for v in y],
        "production": [max(0.0, float(pulp.value(v))) for v in p],
        "inventory": [max(0.0, float(pulp.value(v))) for v in inv],
        "totalCost": float(pulp.value(prob.objective)),
    }


def solve(demands, setupCosts, prodCosts, holdCost, capacities, initialPlan, windowSize) -> dict:
    """Return {"setups": list[int], "production": list[float], "inventory": list[float], "totalCost": float}."""
    n_periods = len(demands)
    win = max(1, min(n_periods, int(windowSize)))
    best = _solve_window(
        demands, setupCosts, prodCosts, holdCost, capacities, list(initialPlan), 0, 0
    )
    if best is None:
        raise RuntimeError("Initial plan is infeasible")

    for _ in range(10):
        improved = False
        for start in range(0, n_periods - win + 1):
            candidate = _solve_window(
                demands,
                setupCosts,
                prodCosts,
                holdCost,
                capacities,
                best["setups"],
                start,
                start + win,
            )
            if candidate is not None and candidate["totalCost"] < best["totalCost"] - 1e-6:
                best = candidate
                improved = True
        if not improved:
            break

    verified = _solve_window(
        demands, setupCosts, prodCosts, holdCost, capacities, best["setups"], 0, 0
    )
    return verified if verified is not None else best
