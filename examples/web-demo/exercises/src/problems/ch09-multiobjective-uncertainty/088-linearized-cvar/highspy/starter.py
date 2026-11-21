import pulp


def solve(returns, probs, alpha, risk_weight, max_weight) -> dict:
    """Return {"weights": list[float], "varThreshold": float, "cvar": float, "totalObjective": float}."""
    # TODO: Build and solve the linearized CVaR portfolio LP, then return the output.
    raise NotImplementedError("Not implemented")
