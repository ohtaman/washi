import pulp


def solve(valuations, total_rent) -> dict:
    """Return {"assignment": list[int], "rents": list[float], "total_valuation": float, "min_surplus": float}."""
    n = len(valuations)

    # Stage 1: MIP to find a welfare-maximizing room assignment
    prob1 = pulp.LpProblem("sharehouse_stage1", pulp.LpMaximize)
    # x[i][r] = 1 if roommate i is assigned to room r
    x = [
        [pulp.LpVariable(f"x_{i}_{r}", cat=pulp.LpBinary) for r in range(n)]
        for i in range(n)
    ]

    # Bijection constraints: each roommate gets 1 room and each room gets 1 roommate
    for i in range(n):
        prob1 += pulp.lpSum(x[i]) == 1
    for r in range(n):
        prob1 += pulp.lpSum(x[i][r] for i in range(n)) == 1

    # Maximize total roommate valuation (utilitarian welfare)
    prob1 += pulp.lpSum(
        valuations[i][r] * x[i][r] for i in range(n) for r in range(n)
    )
    prob1.solve(pulp.HiGHS(msg=False))

    # Round binary values to extract exact room indices
    assignment = [
        next(r for r in range(n) if round(pulp.value(x[i][r])) == 1)
        for i in range(n)
    ]
    total_valuation = float(sum(valuations[i][assignment[i]] for i in range(n)))

    # Stage 2: LP to find envy-free rents maximizing minimum roommate surplus
    prob2 = pulp.LpProblem("sharehouse_stage2", pulp.LpMaximize)
    # Non-negative rent per room; min_surplus is unbounded below in case total_rent exceeds valuations
    rents = [pulp.LpVariable(f"rent_{r}", lowBound=0) for r in range(n)]
    min_surplus = pulp.LpVariable("min_surplus", lowBound=None)

    # Budget balance and envy-freeness: every roommate's assigned surplus >= min_surplus and >= any other room's
    prob2 += pulp.lpSum(rents) == total_rent
    for i in range(n):
        ri = assignment[i]
        prob2 += valuations[i][ri] - rents[ri] >= min_surplus
        for r in range(n):
            if r != ri:
                prob2 += (
                    valuations[i][ri] - rents[ri] >= valuations[i][r] - rents[r]
                )

    # Maximize worst-case roommate surplus (egalitarian / max-min fairness)
    prob2 += min_surplus
    prob2.solve(pulp.HiGHS(msg=False))

    return {
        "assignment": assignment,
        "rents": [float(pulp.value(v)) for v in rents],
        "total_valuation": total_valuation,
        "min_surplus": float(pulp.value(prob2.objective)),
    }
