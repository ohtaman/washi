# 巡回セールスマン問題 (TSP: Benders分解)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 組合せ最適化 / Benders分解 | HiGHS (標準) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">ソースコード</a></li><li><a href="/ja/guide/decomposition">分解法ガイド</a></li></ul> |

**巡回セールスマン問題（TSP）** は、すべての都市をちょうど 1 回ずつ訪問して出発地へ戻る最短の巡回路を求める問題です。

**Dantzig-Fulkerson-Johnson (DFJ) 定式化** では、孤立した小ループである**部分巡回路**を防ぐため、都市の真部分集合 $S \subset V$ に次の部分巡回路除去制約を課します。

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

部分集合は $2^n - 2$ 通りあるため、都市数が増えると全制約の事前列挙は困難になります。**Benders 分解（遅延制約分離）** を使うと、違反した制約だけを反復的に追加できます。
1. **主問題**: 各都市の出次数・入次数を 1 とする次数割当緩和問題を解きます。
2. **分離子問題**: 解が作る有向グラフから閉路を検出し、複数の部分巡回路がある場合は **Benders 実行可能カット** を一括追加（マルチカット分離）します。

## 入力データ

2 次元座標上の **5 都市** を対象とします。

| 都市 | 座標 $(x, y)$ |
| :--- | :---: |
| **都市 A (0)** | $(0, 0)$ |
| **都市 B (1)** | $(1, 0)$ |
| **都市 C (2)** | $(1, 2)$ |
| **都市 D (3)** | $(0, 2)$ |
| **都市 E (4)** | $(0.5, 3)$ |

## WaSHI による実装

<CodeRunner>

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

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

  // 1. 主問題: 次数割当緩和問題（各都市で入次数=1, 出次数=1）
  const master = new Model("TSP_BendersMaster");
  const x = {};
  const distMatrix = {};

  for (let i = 0; i < n; i++) {
    x[i] = {};
    distMatrix[i] = {};
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        x[i][j] = master.binary(`x_${i}_${j}`);
        distMatrix[i][j] = dist(i, j);
      }
    }
  }

  // 目的関数: 移動距離の総和を最小化
  master.objective(minimize(expr`dot(${distMatrix}, ${x})`));

  // 各都市から出る枝が1本、入る枝が1本
  for (let i = 0; i < n; i++) {
    master.constraint(expr`sum(${x[i]}) == 1`, `out_${i}`);
    master.constraint(expr`sum(${n}, ${(j) => x[j][i]}) == 1`, `in_${i}`);
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
          if (i !== j && x[i][j].value === 1) {
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

      // ループが2つ以上ある場合、検出された全部分巡回路に対して Benders カットを一括生成（マルチカット分離）
      if (cycles.length > 1) {
        return cycles.map((cycle) => {
          const S = new Set(cycle);
          cutCounter++;
          console.log(`部分巡回路を検出: [${cycle.map(k => cities[k].name).join(" -> ")}]. Benders カット #${cutCounter} を追加します。`);

          // カット式: sum_{i in S, j not in S} x_ij >= 1
          const outCities = Array.from({ length: n }, (_, j) => j).filter((j) => !S.has(j));
          const cutEdges = cycle.flatMap((i) => outCities.map((j) => x[i][j]));

          return {
            kind: "feasibility",
            constraint: expr`sum(${cutEdges}) >= 1`,
            name: `subtour_cut_${cutCounter}`,
          };
        });
      }

      return null; // 単一の巡回路が得られたため終了
    },
  });

  console.log(`\nステータス: ${result.status}`);
  console.log(`最短巡回距離: ${result.objectiveValue?.toFixed(3)}`);
  console.log(`追加されたBendersカット数: ${result.cutsAdded}`);
  console.log(`反復回数: ${result.iterations}`);

  console.log("\n採用された巡回枝:");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && result.values[`x_${i}_${j}`] === 1) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (距離: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
}

runTSP();
```

</CodeRunner>

## 解の読み解きとポイント

### 遅延制約分離とマルチカット分離

主問題には最初に $2n$ 本の次数制約だけを置き、部分巡回路が現れたときだけ `subproblem` からカットを追加します。`cycles.map(...)` でカット配列を返すと 1 回の反復で全部分巡回路を同時に除去でき、主問題の再求解回数を抑えられます。単一の巡回路が得られたら `null` を返して反復を終了します。

### 2 種類の等価な DFJ カット表現

各都市の出次数制約 $\sum_{j \ne i} x_{ij} = 1$ を $i \in S$ について足し合わせると、次の恒等式が成り立ちます。

$$\sum_{i \in S, \, j \in S} x_{ij} + \sum_{i \in S, \, j \notin S} x_{ij} = |S|$$

したがって、上記コードのカットセット形式 $\sum_{i \in S, j \notin S} x_{ij} \ge 1$ と、[`14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts) の内部枝形式 $\sum_{i \in S, j \in S} x_{ij} \le |S| - 1$ は代数的に等価です。

### 2 都市間の往復ループの事前除去

都市数が増えると、初期反復では 2 都市間の往復（$i \leftrightarrow j$）が頻発します。主問題にあらかじめ $\binom{n}{2}$ 本の $x_{ij} + x_{ji} \le 1$ を入れておくと、Benders 反復回数を大きく減らせます。
