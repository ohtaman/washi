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
    """Return {"invite": list[int], "giftBudget": list[float], "totalEnjoyment": float}."""
    n = len(base_enjoyment)

    prob = pulp.LpProblem("party_invite_logic", pulp.LpMaximize)
    invite = [pulp.LpVariable(f"inv_{i}", cat=pulp.LpBinary) for i in range(n)]
    gift_budget = [pulp.LpVariable(f"gift_{i}", lowBound=0) for i in range(n)]

    for i in range(n):
        prob += min_spend[i] * invite[i] <= gift_budget[i]
        prob += gift_budget[i] <= max_spend[i] * invite[i]
    prob += pulp.lpSum(gift_budget) <= budget
    for a, b in implications:
        prob += invite[a] <= invite[b]
    for u, v in conflicts:
        prob += invite[u] + invite[v] <= 1
    for rule in group_rules:
        prob += pulp.lpSum(invite[i] for i in rule["guests"]) >= rule["minCount"]

    prob += pulp.lpDot(base_enjoyment, invite) + pulp.lpDot(bonus_rates, gift_budget)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "invite": [round(pulp.value(v)) for v in invite],
        "giftBudget": [float(pulp.value(v)) for v in gift_budget],
        "totalEnjoyment": float(pulp.value(prob.objective)),
    }
