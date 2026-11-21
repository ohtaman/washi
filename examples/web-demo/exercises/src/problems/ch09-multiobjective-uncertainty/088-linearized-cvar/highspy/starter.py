import pulp


def solve(returns, probs, alpha, riskWeight, maxWeight) -> dict:
    """Return {"weights": list[float], "varThreshold": float, "cvar": float, "totalObjective": float}."""
    # TODO: Build and solve the linearized CVaR portfolio LP, then return the output.
    raise NotImplementedError("Not implemented")
