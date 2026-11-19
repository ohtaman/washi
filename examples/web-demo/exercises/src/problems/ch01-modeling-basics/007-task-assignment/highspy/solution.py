import highspy


def solve(input_data: dict) -> dict:
    """Return {"assignment": list[int], "totalCost": float}."""
    costs = input_data["costs"]
    n = len(costs)

    h = highspy.Highs()
    h.silent()

    x = [[h.addBinary(name=f"x_{i}_{j}") for j in range(n)] for i in range(n)]

    for i in range(n):
        h.addConstr(h.qsum(x[i][j] for j in range(n)) == 1)
    for j in range(n):
        h.addConstr(h.qsum(x[i][j] for i in range(n)) == 1)

    h.minimize(
        h.qsum(costs[i][j] * x[i][j] for i in range(n) for j in range(n))
    )

    assignment = [
        next(j for j in range(n) if round(h.val(x[i][j])) == 1)
        for i in range(n)
    ]

    return {
        "assignment": assignment,
        "totalCost": float(h.getObjectiveValue()),
    }
