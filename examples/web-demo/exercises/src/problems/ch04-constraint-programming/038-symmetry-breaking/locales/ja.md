# #038. 対称性除去（Symmetry Breaking）付き VM 配置

<!-- section:scenario -->
容量上限 capacity をもつ同質な物理ホストが numHosts 台あり、n 個の仮想マシン（VM）を配置します。各 VM i は配置先ホストの容量を sizes[i] だけ消費します。

非共有ペア conflicts 内の [u, v] は同じホストに相乗りできず、各ホストの負荷合計は capacity 以下でなければなりません。各 VM の配置先ホスト番号（0 から numHosts - 1）を決め、使用するホスト台数 usedHosts を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `numHosts` | `number` | 同質なホストの総台数（`0` 〜 `numHosts - 1`） |
| `capacity` | `number` | 各ホスト共通の容量上限 |
| `sizes` | `number[]` | 各 VM の必要容量（正の整数） |
| `conflicts` | `number[][]` | `hosts[u] != hosts[v]` が必要な非共有ペア `[u, v]` |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `hosts` | `number[]` | 各 VM の配置先ホスト番号（`0` 〜 `numHosts - 1`） |
| `usedHosts` | `number` | 最小化された使用ホスト台数 |

<!-- section:example -->
**入力例**

```json
{
  "numHosts": 4,
  "capacity": 10,
  "sizes": [4, 4, 7, 3],
  "conflicts": [
    [0, 1]
  ]
}
```

**出力例**

```json
{
  "hosts": [2, 0, 1, 0],
  "usedHosts": 3
}
```

ホスト 0 に VM `{1, 3}`（負荷 $4 + 3 = 7 \le 10$）、ホスト 1 に VM `{2}`（負荷 $7 \le 10$）、ホスト 2 に VM `{0}`（負荷 $4 \le 10$）を割り当てると、非共有ペア `(0, 1)` も別ホストになり、使用ホスト数は **3** 台です。

<!-- section:hint1 -->
各 VM の整数ホスト変数と 0-1 割当行列をチャネリングし、各ホストの整数負荷変数と稼働フラグ（0-1 変数）を組み合わせます。すべての物理ホストが同質であるため、ホスト番号の置換対称性を取り除く順序制約を導入してください。

<!-- section:hint2 -->
`dot(hostIndices, assign[i]) == hosts[i]` で変数を結び、`load[k] <= capacity * used[k]` と `load[k] >= used[k]` で負荷と稼働フラグを連動させ、`hosts[u] != hosts[v]` で非共有制約を課します。対称性破壊として `used[k] >= used[k + 1]` および `load[k] >= load[k + 1]` を追加し、`minimize(sum(used))` を `solver: "pumpkin"` で解いてください。
