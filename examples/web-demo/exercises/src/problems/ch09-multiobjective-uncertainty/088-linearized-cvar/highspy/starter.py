import pulp


def solve(input_data: dict) -> dict:
    """Return {"weights": list[float], "varThreshold": float, "cvar": float, "totalObjective": float}."""
    returns = input_data["returns"]
    probs = input_data["probs"]
    alpha = input_data["alpha"]
    risk_weight = input_data["riskWeight"]
    max_weight = input_data["maxWeight"]
    S = len(returns)
    n = len(returns[0])

    prob = pulp.LpProblem("linearized_cvar", pulp.LpMinimize)
    w = [pulp.LpVariable(f"w_{j}", lowBound=0, upBound=max_weight) for j in range(n)]
    eta = pulp.LpVariable("eta", lowBound=None, upBound=None)
    u = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]

    # TODO:
    # 1. Enforce sum(w) == 1
    # 2. For each scenario s, enforce u[s] >= -lpDot(returns[s], w) - eta
    # 3. Minimize expected loss + risk_weight * CVaR, solve with HiGHS,
    #    and return {"weights": ..., "varThreshold": ..., "cvar": ..., "totalObjective": ...}
    raise NotImplementedError("Not implemented")
