## アプローチ

配送員 $i$ と担当エリア $j$ の組み合わせを表す 2 次元 0-1 変数行列 `x[i][j]` を定義し、すべての行和を `1`（各配送員は 1 エリア）、すべての列和を `1`（各エリアは 1 人）と制約して総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## ポイント

- **行和・列和 = 1 で完全マッチングを表現する**: 行制約だけでは同じエリアに複数人が集中し、列制約だけでは同じ配送員が複数エリアを抱えてしまいます。両方を課すことで 1 対 1 の置換が決まります。（割当問題の制約行列は全ユニモジュラ性を持つため、実は連続緩和でも端点が 0-1 になります。）
- **配列から割当番号への変換**: 解決後に各行 `i` の中で `cell.value! === 1`（Python は `round(pulp.value(x[i][j])) == 1`）となる列インデックス `j` を取得します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

2 次元の 0-1 変数行列 `x` に対して行方向・列方向の和をそれぞれ `1` に制約し、求解後は各行で値が `1` になっている列インデックスを取り出します。

**WaSHI (TypeScript)**

```ts
m.constraint(x.map((row) => expr`${sum(row)} == 1`));
m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

const assignment = x.map((row) =>
  row.findIndex((cell) => cell.value! === 1)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n)) == 1
for j in range(n):
    prob += pulp.lpSum(x[i][j] for i in range(n)) == 1

assignment = [
    next(j for j in range(n) if round(pulp.value(x[i][j])) == 1)
    for i in range(n)
]
```
