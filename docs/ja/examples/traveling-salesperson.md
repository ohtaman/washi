# 巡回セールスマン問題 (TSP: Benders分解)

| 問題クラス | ソルバー | 主要 API | 関連リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Benders分解 | HiGHS (標準) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">ソースコード</a></li><li><a href="../guide/decomposition.md">分解法ガイド</a></li></ul> |

**巡回セールスマン問題（TSP: Traveling Salesperson Problem）** は、組合せ最適化における最も古典的かつ重要な NP 困難問題です。与えられたすべての都市をちょうど 1 回ずつ訪問して出発地に戻る、移動距離が最小となる巡回路（ツアー）を求めます。

古典的な **Dantzig-Fulkerson-Johnson (DFJ) 定式化** では、閉じた小ループ（**部分巡回路: Subtour**）を排除するために、都市の部分集合 $S \subset V$ すべてに対して「集合 $S$ を抜け出すエッジを最低 1 本は選ばなければならない」という部分巡回路除去制約を設けます：

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

しかし、都市の部分集合は $2^n - 2$ 通り存在するため、20 都市程度でも制約数が 100 万本を超え、事前にすべての制約をモデルに投入することは不可能です。

**Benders分解（遅延切除平面法: Lazy Subtour Elimination）** を用いることで、この問題を極めて効率的に解決できます：
1. **主問題（Master Problem）**: 「各都市から出る枝が1本、入る枝が1本」という軽量な次数割り当て問題（2-factor 緩和）だけを解きます。
2. **Benders 分離子問題（Subproblem）**: 主問題の暫定解から得られたグラフを走査し、もし孤立した部分巡回路（小ループ）が見つかった場合、そのループを破壊する **Benders 実行可能カット（Feasibility Cut）** を主問題へ動的注入します。これを全体が 1 つの閉路に繋がるまで反復します。

## 問題の入力データ

2 次元座標上に配置された **5 つの都市** を考えます：

| 都市 | 座標 $(x, y)$ | 役割 |
| :--- | :---: | :--- |
| **都市 A (0)** | $(0, 0)$ | 出発点 / デポ |
| **都市 B (1)** | $(1, 0)$ | 南の拠点 |
| **都市 C (2)** | $(1, 2)$ | 東の拠点 |
| **都市 D (3)** | $(0, 2)$ | 北の拠点 |
| **都市 E (4)** | $(0.5, 3)$ | 最北の拠点 |

## WaSHI による実装

下の **▶ 実行（Run）** ボタンをクリックすると、ブラウザ上で実際にソルバーが起動します。最初の反復で部分巡回路 `[A -> B -> A]` が検出され、Benders cut が注入されてわずか 2 回の反復で最適ツアーに収束する様子を体験できます：

<CodeRunner>

```typescript
import { Model, expr, minimize, LinExpr } from "@ohtaman/washi";

async function runTSP() {
  const cities = [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 1, y: 0 },
    { name: "C", x: 1, y: 2 },
    { name: "D", x: 0, y: 2 },
    { name: "E", x: 0.5, y: 3 },
  ];
  const n = cities.length;

  function dist(i, j) {
    const dx = cities[i].x - cities[j].x;
    const dy = cities[i].y - cities[j].y;
    return Math.hypot(dx, dy);
  }

  // 1. 主問題: 次数割り当て問題（各都市で入次数=1, 出次数=1）
  const master = new Model("TSP_BendersMaster");
  const x = {};

  for (let i = 0; i < n; i++) {
    x[i] = {};
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        x[i][j] = master.binary(`x_${i}_${j}`);
      }
    }
  }

  // 目的関数: 移動距離の総和を最小化
  let totalDistance = new LinExpr();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        totalDistance = totalDistance.add(x[i][j].mul(dist(i, j)));
      }
    }
  }
  master.objective(minimize(totalDistance));

  // 各都市から出る枝が1本、入る枝が1本
  for (let i = 0; i < n; i++) {
    let outExpr = new LinExpr();
    let inExpr = new LinExpr();
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        outExpr = outExpr.add(x[i][j]);
        inExpr = inExpr.add(x[j][i]);
      }
    }
    master.constraint(expr`${outExpr} == 1`, `out_${i}`);
    master.constraint(expr`${inExpr} == 1`, `in_${i}`);
  }

  console.log("Benders遅延部分巡回路除去によるTSPの求解を開始...");

  // 2. Benders分解で求解
  let cutCounter = 0;
  const result = await master.solveBenders({
    subproblem: () => {
      // 主問題の暫定解で選ばれた有効枝を特定
      const succ = {};
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && Math.round(x[i][j].value ?? 0) === 1) {
            succ[i] = j;
          }
        }
      }

      // 連結ループ（閉路）を検出
      const visited = new Set();
      const cycles = [];
      for (let i = 0; i < n; i++) {
        if (!visited.has(i)) {
          const cycle = [];
          let curr = i;
          while (!visited.has(curr)) {
            visited.add(curr);
            cycle.push(curr);
            curr = succ[curr];
          }
          cycles.push(cycle);
        }
      }

      // ループが2つ以上ある場合、部分巡回路が存在するので Benders カットを生成
      if (cycles.length > 1) {
        const smallestCycle = cycles.reduce((min, c) => (c.length < min.length ? c : min));
        const S = new Set(smallestCycle);
        cutCounter++;
        console.log(`部分巡回路を検出: [${smallestCycle.map(k => cities[k].name).join(" -> ")}]. Benders カット #${cutCounter} を追加します。`);

        // カット式: sum_{i in S, j not in S} x_ij >= 1
        let cutLhs = new LinExpr();
        for (const i of S) {
          for (let j = 0; j < n; j++) {
            if (!S.has(j)) {
              cutLhs = cutLhs.add(x[i][j]);
            }
          }
        }

        return {
          kind: "feasibility",
          constraint: expr`${cutLhs} >= 1`,
          name: `subtour_cut_${cutCounter}`,
        };
      }

      return null; // 全都市をめぐる1本の完全なツアーが完成！
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`最短巡回距離: ${result.objectiveValue?.toFixed(3)}`);
  console.log(`追加されたBendersカット数: ${result.cutsAdded}`);
  console.log(`反復回数: ${result.iterations}`);

  console.log("\n採用された巡回エッジ:");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (result.values[`x_${i}_${j}`] ?? 0) > 0.5) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (距離: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
}

runTSP();
```

</CodeRunner>

## 実装のポイント

1. **指数本の制約を事前生成しない**: $2^n$ 本の全部分巡回路制約をあらかじめモデルに加える必要はありません。最初は最低限の次数制約だけで解き、違反が見つかった小ループに対してのみ動的にカットを追加します。
2. **高速な分離コールバック**: `subproblem` コールバックは主問題の暫定解 `x[i][j].value` を直接参照し、$O(V)$ のグラフ走査で閉路をチェックして `{ kind: "feasibility", constraint: ... }` を返すだけで済みます。
3. **自然な収束判定**: 子問題が `null` を返した時点で、「これ以上違反する部分巡回路は存在しない」ことが数学的に保証され、大域的最適解として終了します。
