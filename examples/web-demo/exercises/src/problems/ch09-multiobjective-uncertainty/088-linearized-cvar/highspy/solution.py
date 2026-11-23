import pulp


def solve(returns, probs, alpha, risk_weight, max_weight) -> dict:
    """Return {"weights": list[float], "varThreshold": float, "cvar": float, "totalObjective": float}."""
    S = len(returns)
    n = len(returns[0])

    prob = pulp.LpProblem("linearized_cvar", pulp.LpMinimize)
    w = [pulp.LpVariable(f"w_{j}", lowBound=0, upBound=max_weight) for j in range(n)]
    eta = pulp.LpVariable("eta", lowBound=None, upBound=None)
    u = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]

    prob += pulp.lpSum(w) == 1
    for s in range(S):
        prob += pulp.lpDot(returns[s], w) + eta + u[s] >= 0

    expected_loss = -pulp.lpSum(
        probs[s] * pulp.lpDot(returns[s], w) for s in range(S)
    )
    cvar_expr = eta + (1.0 / (1.0 - alpha)) * pulp.lpDot(probs, u)
    prob += expected_loss + risk_weight * cvar_expr
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "weights": [float(pulp.value(v)) for v in w],
        "varThreshold": float(pulp.value(eta)),
        "cvar": float(pulp.value(cvar_expr)),
        "totalObjective": float(pulp.value(prob.objective)),
    }
