import pulp


def solve(power, costs, budget, max_party_size, pairs) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "totalValue": float}."""
    n = len(power)
    P = len(pairs)

    prob = pulp.LpProblem("rpg_party_synergy", pulp.LpMaximize)

    # TODO: Build and solve the RPG party synergy MIP, then return the output.
    raise NotImplementedError("Not implemented")
