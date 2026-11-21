import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignments": list[list[float]], "peakLoad": float}."""
    weights = input_data["weights"]
    compatible = input_data["compatible"]
    n_jobs = len(weights)
    n_servers = len(compatible[0])

    prob = pulp.LpProblem("minimax_load_balancing", pulp.LpMinimize)

    # TODO: Declare variables, enforce job assignments and server peak bounds, and minimize peak load.
    raise NotImplementedError("Not implemented")
