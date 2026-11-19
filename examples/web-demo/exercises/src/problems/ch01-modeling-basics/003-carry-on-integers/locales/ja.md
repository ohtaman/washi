# #003. 荷物パッキングと整数変数

<!-- section:scenario -->
総重量の上限が決まっているバッグに、複数のアイテムをそれぞれ **整数個** 詰めて持ち運びます。各アイテムには 1 個あたりの重さ・価値・持ち込み上限個数が設定されており、上限個数とバッグの総重量制限を守りつつ、**合計価値を最大化** してください。

現在の初期コードには 2 つの意図的な欠陥があります。決定変数が連続変数のままになっており、さらに合計重量の上限制約が抜けています。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `maxWeight` | `number` | バッグの最大積載重量 |
| `weights` | `number[]` | 各アイテム 1 個あたりの重さ |
| `values` | `number[]` | 各アイテム 1 個あたりの価値 |
| `maxCounts` | `number[]` | 各アイテムの最大許容個数 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `counts` | `number[]` | 各アイテムの積載個数（すべて整数） |
| `totalValue` | `number` | 最大化された合計価値 |

<!-- section:example -->
**入力例**

```json
{
  "maxWeight": 10,
  "weights": [3, 4, 2],
  "values": [40, 55, 22],
  "maxCounts": [2, 2, 3]
}
```

**出力例**

```json
{
  "counts": [2, 1, 0],
  "totalValue": 135
}
```

アイテム 0 を 2 個・アイテム 1 を 1 個選ぶと総重量が $2 \times 3 + 1 \times 4 = 10$ となり、整数解としての最大価値 **135** を達成します。

<!-- section:hint1 -->
- **WaSHI**: `m.integer(...)` で整数変数を宣言し、`` m.constraint(expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`) `` で重量上限を追加します。
- **highspy**: `h.addIntegral(lb=0, ub=cap, name=f"item_{i}")` で整数変数を作り、`h.addConstr(h.qsum(...) <= input_data["maxWeight"])` を追加します。

<!-- section:hint2 -->
整数変数であっても、内部の浮動小数点計算により返ってくる値が `1.999999999` や `-0` になることがあります。返り値を作るときに `Math.round(v.value!)`（Python なら `round(h.val(x))`）で整数に丸めるクセをつけておくと安全です。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} \quad \forall i
\end{aligned}
$$
