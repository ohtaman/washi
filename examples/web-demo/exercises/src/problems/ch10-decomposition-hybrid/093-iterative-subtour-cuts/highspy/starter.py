import pulp


def solve(input_data: dict) -> dict:
    """Return {"tour": list[int], "totalDistance": float, "iterations": int}."""
    distances = input_data["distances"]
    n = len(distances)

    prob = pulp.LpProblem("symmetric_tsp_dfj", pulp.LpMinimize)
    edges = {
        (i, j): pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary)
        for i in range(n)
        for j in range(i + 1, n)
    }

    # TODO:
    # 1. Minimize total tour distance and enforce degree == 2 at every city i
    # 2. Loop: solve with prob.solve(pulp.HiGHS(msg=False)), find connected components/cycles
    # 3. If single Hamiltonian cycle, return {"tour": ..., "totalDistance": ..., "iterations": ...}
    # 4. Otherwise add DFJ cut sum_{i,j in S, i < j} edges[(i, j)] <= len(S) - 1 for each subtour S
    raise NotImplementedError("Not implemented")
