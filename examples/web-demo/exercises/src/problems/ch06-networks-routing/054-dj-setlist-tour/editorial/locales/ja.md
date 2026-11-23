## 考え方

各曲の入次数・出次数を $1$ にするバイナリ遷移変数 $x_{ij} \in \{0, 1\}$（$i \ne j$）に加え、$i \ge 1$ に対する連続の MTZ 再生順ポテンシャル変数 $u_i \in [1, n-1]$ と制約 $u_i - u_j + n x_{ij} \le n - 1$ を導入し、総遷移コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n-1\} \\
& u_i - u_j + n x_{ij} \le n - 1 && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad 1 \le u_i \le n - 1
\end{aligned}
$$

## 重要ポイント

- **次数制約だけでは不十分な理由**: 入次数 = 出次数 = 1 は頂点素な閉路被覆しか保証しません。例題でも、`0 <-> 2`（コスト 5）と `1 <-> 3`（コスト 6）の 2 つの小ループに分かれるとコスト 11 で条件をすり抜けてしまいます（本来の最適値は 18）。
- **MTZ による部分巡回路除去の仕組み**: オープニング曲以外の遷移 $(i, j)$ が選ばれる（$x_{ij} = 1$）と $u_j \ge u_i + 1$ が課され、曲順に沿ってポテンシャルが厳密に増加します。曲 0 を含まない任意の閉路 $C$ で辺ごとに和を取ると $0 \ge |C| > 0$ の矛盾が生じるため、部分巡回路が排除されます。一方 $x_{ij} = 0$ のときは $u_i \le n - 1, u_j \ge 1$ より $u_i - u_j \le n - 1$ が常に成り立ちます。
- 関連用語: [ガイド＆用語集 — 変数の種類](?view=guide&lang=ja#variable-types)・[問題ファミリー](?view=guide&lang=ja#paradigms)

## 主要な実装

オープニング曲以外のインデックス配列 `nonStart` を用意し、`flatMap` と `filter` で異なる 2 曲のペアを列挙して MTZ 部分巡回路除去制約をまとめて登録します。

**WaSHI (TypeScript)**

```ts
const nonStart = Array.from({ length: n - 1 }, (_, k) => k + 1);
m.constraint(
  nonStart.flatMap((i) =>
    nonStart
      .filter((j) => i !== j)
      .map((j) => expr`${u[i]!} - ${u[j]!} + ${n} * ${x[i][j]!} <= ${n - 1}`)
  )
);
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + n * x[i][j] <= n - 1
```
