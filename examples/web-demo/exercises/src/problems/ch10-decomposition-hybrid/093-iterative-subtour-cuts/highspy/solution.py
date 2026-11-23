import pulp


def solve(distances) -> dict:
    """Return {"tour": list[int], "totalDistance": float, "iterations": int}."""
    n = len(distances)

    prob = pulp.LpProblem("symmetric_tsp_dfj", pulp.LpMinimize)
    edges = {
        (i, j): pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary)
        for i in range(n)
        for j in range(i + 1, n)
    }

    prob += pulp.lpSum(distances[i][j] * var for (i, j), var in edges.items())
    for i in range(n):
        prob += pulp.lpSum(edges[(min(i, j), max(i, j))] for j in range(n) if j != i) == 2

    iterations = 0
    final_tour = []

    while True:
        iterations += 1
        prob.solve(pulp.HiGHS(msg=False))

        adj = {i: [] for i in range(n)}
        for (i, j), var in edges.items():
            if round(pulp.value(var)) == 1:
                adj[i].append(j)
                adj[j].append(i)

        visited = set()
        components = []
        for start in range(n):
            if start in visited:
                continue
            comp = []
            curr, prev = start, -1
            while curr not in visited:
                visited.add(curr)
                comp.append(curr)
                nxt = [u for u in adj[curr] if u != prev][0]
                prev, curr = curr, nxt
            components.append(comp)

        if len(components) == 1:
            final_tour = components[0]
            break

        for comp in components:
            prob += (
                pulp.lpSum(
                    edges[(min(a, b), max(a, b))]
                    for idx_a, a in enumerate(comp)
                    for b in comp[idx_a + 1 :]
                )
                <= len(comp) - 1
            )

    return {
        "tour": final_tour,
        "totalDistance": float(pulp.value(prob.objective)),
        "iterations": iterations,
    }
