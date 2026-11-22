import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignment": list[int], "rents": list[float], "totalValuation": float, "minSurplus": float}."""
    valuations = input_data["valuations"]
    total_rent = input_data["totalRent"]
    n = len(valuations)

    # Stage 1: MIP to find a welfare-maximizing room assignment
    prob1 = pulp.LpProblem("sharehouse_stage1", pulp.LpMaximize)
    x = [
        [pulp.LpVariable(f"x_{i}_{r}", cat=pulp.LpBinary) for r in range(n)]
        for i in range(n)
    ]

    for i in range(n):
        prob1 += pulp.lpSum(x[i]) == 1
    for r in range(n):
        prob1 += pulp.lpSum(x[i][r] for i in range(n)) == 1

    prob1 += pulp.lpSum(
        valuations[i][r] * x[i][r] for i in range(n) for r in range(n)
    )
    prob1.solve(pulp.HiGHS(msg=False))

    assignment = [
        next(r for r in range(n) if round(pulp.value(x[i][r])) == 1)
        for i in range(n)
    ]
    total_valuation = float(sum(valuations[i][assignment[i]] for i in range(n)))

    # Stage 2: LP to find envy-free rents maximizing minimum roommate surplus
    prob2 = pulp.LpProblem("sharehouse_stage2", pulp.LpMaximize)
    rents = [pulp.LpVariable(f"rent_{r}", lowBound=0) for r in range(n)]
    min_surplus = pulp.LpVariable("min_surplus", lowBound=None)

    prob2 += pulp.lpSum(rents) == total_rent
    for i in range(n):
        ri = assignment[i]
        prob2 += valuations[i][ri] - rents[ri] >= min_surplus
        for r in range(n):
            if r != ri:
                prob2 += (
                    valuations[i][ri] - rents[ri] >= valuations[i][r] - rents[r]
                )

    prob2 += min_surplus
    prob2.solve(pulp.HiGHS(msg=False))

    return {
        "assignment": assignment,
        "rents": [float(pulp.value(v)) for v in rents],
        "totalValuation": total_valuation,
        "minSurplus": float(pulp.value(prob2.objective)),
    }
