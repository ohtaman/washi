# #065. 多段階サプライチェーン・ネットワーク設計

<!-- section:scenario -->
製造工場候補・配送センター（DC）候補・顧客エリアからなる 2 段階のサプライチェーンネットワークを設計します。工場または DC を開設するとそれぞれの固定開設費が発生し、能力上限まで出荷・中継を行えるようになりますが、開設しない拠点には一切フローを流せません。

各 DC は純粋な中継ノードとして工場からの総流入量と顧客への総流出量が一致する必要があり、すべての顧客需要を過不足なく満たさなければなりません。開設する工場・DC と両段階の輸送量を決めて、**固定開設費と輸送費の合計を最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `plantFixedCosts` | `number[]` | 工場 $p$ の固定開設費 $F^P_p$ |
| `plantCaps` | `number[]` | 工場 $p$ の最大供給能力 $C^P_p$ |
| `dcFixedCosts` | `number[]` | DC $d$ の固定開設費 $F^D_d$ |
| `dcCaps` | `number[]` | DC $d$ の最大中継能力 $C^D_d$ |
| `demands` | `number[]` | 顧客 $c$ の需要量 $D_c$ |
| `plantDcCosts` | `number[][]` | 工場 $p \to$ DC $d$ の 1 単位あたり輸送費 $c_{p,d}$ |
| `dcCustomerCosts` | `number[][]` | DC $d \to$ 顧客 $c$ の 1 単位あたり配送費 $c'_{d,c}$ |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `openPlants` | `number[]` | 各工場の開設選択（`0` または `1`） |
| `openDcs` | `number[]` | 各 DC の開設選択（`0` または `1`） |
| `plantToDc` | `number[][]` | 工場 $\to$ DC の非負輸送量行列（$P \times D$） |
| `dcToCustomer` | `number[][]` | DC $\to$ 顧客の非負配送量行列（$D \times C$） |
| `totalCost` | `number` | 最小化された総コスト（固定費＋輸送費） |

<!-- section:example -->
**入力例**

```json
{
  "plantFixedCosts": [500, 420],
  "plantCaps": [120, 100],
  "dcFixedCosts": [250, 200, 280],
  "dcCaps": [90, 80, 100],
  "demands": [30, 40, 35, 25],
  "plantDcCosts": [
    [4, 6, 8],
    [7, 5, 3]
  ],
  "dcCustomerCosts": [
    [3, 5, 9, 7],
    [6, 2, 4, 8],
    [8, 7, 3, 2]
  ]
}
```

**出力例**

```json
{
  "openPlants": [1, 1],
  "openDcs": [1, 0, 1],
  "plantToDc": [
    [70, 0, 0],
    [0, 0, 60]
  ],
  "dcToCustomer": [
    [30, 40, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 35, 25]
  ],
  "totalCost": 2355
}
```

両工場と DC 0・2 を開設すると、能力上限・DC 流量保存（`70 == 30+40`, `60 == 35+25`）・顧客需要を満たし、総コストは $1450 + 460 + 445 =$ **2,355** となります。
