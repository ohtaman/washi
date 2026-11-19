# #009. 多期間生産・在庫計画（フロー保存則）

<!-- section:scenario -->
ある工場で複数期間にわたる通常生産・残業生産・期末在庫のスケジュールを計画します。期首在庫が与えられており、各期では通常生産上限・残業生産上限・倉庫保管容量の上限を守る必要があります。

各期において「前期在庫 ＋ 通常生産 ＋ 残業生産 − 需要 ＝ 期末在庫」の収支が成り立ち、さらに最終期の末には規定の安全在庫以上を残さなければなりません。各期の通常生産量・残業生産量・期末在庫を決めて、**通常生産費・残業費・保管費の合計コストを最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `demands` | `number[]` | 各期 $t$ の製品需要量 |
| `regCap` | `number[]` | 各期 $t$ の通常生産能力上限 |
| `otCap` | `number[]` | 各期 $t$ の残業生産能力上限 |
| `invCap` | `number` | 各期末に保管できる倉庫の容量上限 |
| `initialInventory` | `number` | 期首（0期開始前）の初期在庫 |
| `minFinalInventory` | `number` | 最終期末に残すべき最低安全在庫 |
| `regCost` | `number` | 通常生産 1 単位あたりのコスト |
| `otCost` | `number` | 残業生産 1 単位あたりのコスト |
| `holdCost` | `number` | 在庫 1 単位・1 期あたりの保管コスト |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `regular` | `number[]` | 各期の通常生産量スケジュール |
| `overtime` | `number[]` | 各期の残業生産量スケジュール |
| `inventory` | `number[]` | 各期の期末在庫スケジュール |
| `totalCost` | `number` | 最小化された総生産＋保管コスト |

<!-- section:example -->
**入力例**

```json
{
  "demands": [80, 140, 120, 70],
  "regCap": [100, 100, 100, 100],
  "otCap": [40, 40, 40, 40],
  "invCap": 60,
  "initialInventory": 10,
  "minFinalInventory": 10,
  "regCost": 20,
  "otCost": 32,
  "holdCost": 3
}
```

**出力例**

```json
{
  "regular": [100, 100, 100, 80],
  "overtime": [0, 10, 20, 0],
  "inventory": [30, 0, 0, 10],
  "totalCost": 8680
}
```

期 0 の余裕ある通常生産枠で 30 単位を先行生産し、保管費 3/単位で期 1 へ繰り越すことで、残業の割増単価（+12/単位）を最小限に抑えて総コスト **8,680** を達成しています。

<!-- section:hint1 -->
変数配列 `regular`, `overtime`, `inventory`（上下界・最終期の安全在庫下界つき）は初期コードに用意済みです。各時刻 $t$ を繋ぐ **在庫フロー保存則** を追加してください：
$$\text{prevInventory} + \text{regular}[t] + \text{overtime}[t] - \text{inventory}[t] == \text{demands}[t]$$
ただし $t = 0$ のとき `prevInventory = initialInventory`、$t \ge 1$ のときは `inventory[t - 1]` です。

<!-- section:hint2 -->
目的関数 `regCost * sum(regular) + otCost * sum(overtime) + holdCost * sum(inventory)` を最小化して解き、`{ regular, overtime, inventory, totalCost }` を返してください。

<!-- section:formulation -->
$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

「次期状態 ＝ 前期状態 ＋ 流入 − 流出」というネットワークフロー構造は、生産計画だけでなく蓄電池運用やキャッシュフロー管理まで共通して登場します。
