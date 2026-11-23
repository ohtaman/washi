import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "totalValue": float}."""
    power = input_data["power"]
    costs = input_data["costs"]
    budget = input_data["budget"]
    max_party_size = input_data["maxPartySize"]
    pairs = input_data["pairs"]
    n = len(power)
    P = len(pairs)

    prob = pulp.LpProblem("rpg_party_synergy", pulp.LpMaximize)

    # TODO: Build and solve the RPG party synergy MIP, then return the output.
    raise NotImplementedError("Not implemented")
