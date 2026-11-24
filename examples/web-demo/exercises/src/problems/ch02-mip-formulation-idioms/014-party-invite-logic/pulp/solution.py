import pulp


def solve(
    budget,
    base_enjoyment,
    bonus_rates,
    min_spend,
    max_spend,
    implications,
    conflicts,
    group_rules,
) -> dict:
    """Return {"invite": list[int], "gift_budget": list[float], "total_enjoyment": float}."""
    n = len(base_enjoyment)

    prob = pulp.LpProblem("party_invite_logic", pulp.LpMaximize)
    # Decision variables: binary invite[i] (whether guest i is invited) and continuous gift_budget[i] >= 0.
    invite = [pulp.LpVariable(f"inv_{i}", cat=pulp.LpBinary) for i in range(n)]
    gift_budget = [pulp.LpVariable(f"gift_{i}", lowBound=0) for i in range(n)]

    # Semi-continuous gift spending: 0 if not invited, or in [min_spend[i], max_spend[i]] if invited.
    for i in range(n):
        prob += min_spend[i] * invite[i] <= gift_budget[i]
        prob += gift_budget[i] <= max_spend[i] * invite[i]
    # Total gift spending limit.
    prob += pulp.lpSum(gift_budget) <= budget
    # Logical implications (a => b), conflicts (not both u and v), and group minimum attendance rules.
    for a, b in implications:
        prob += invite[a] <= invite[b]
    for u, v in conflicts:
        prob += invite[u] + invite[v] <= 1
    for rule in group_rules:
        prob += pulp.lpSum(invite[i] for i in rule["guests"]) >= rule["minCount"]

    # Objective: maximize base enjoyment plus gift-weighted bonus enjoyment.
    prob += pulp.lpDot(base_enjoyment, invite) + pulp.lpDot(bonus_rates, gift_budget)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "invite": [round(pulp.value(v)) for v in invite],
        "gift_budget": [float(pulp.value(v)) for v in gift_budget],
        "total_enjoyment": float(pulp.value(prob.objective)),
    }
