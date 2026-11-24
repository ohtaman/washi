import pulp


def solve(returns, probs, alpha, risk_weight, max_weight) -> dict:
    """Return {"weights": list[float], "var_threshold": float, "cvar": float, "total_objective": float}."""
    # TODO: Build and solve the linearized CVaR portfolio LP, then return the output.
    raise NotImplementedError("Not implemented")
