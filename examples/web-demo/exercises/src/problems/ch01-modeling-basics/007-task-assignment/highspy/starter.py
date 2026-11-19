import highspy


def solve(input_data: dict) -> dict:
    costs = input_data["costs"]
    n = len(costs)

    h = highspy.Highs()
    h.silent()

    x = [[h.addBinary(name=f"x_{i}_{j}") for j in range(n)] for i in range(n)]

    # TODO:
    # 1. Enforce row sum == 1 and column sum == 1
    # 2. Call h.minimize(...) on sum(costs[i][j] * x[i][j])
    # 3. Extract assignment[i] = column j with round(h.val(x[i][j])) == 1 and return {"assignment": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
