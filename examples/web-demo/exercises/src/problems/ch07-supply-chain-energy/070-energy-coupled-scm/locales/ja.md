# #070. 電力料金・蓄電池連携型ロットサイズ総合計画

<!-- section:scenario -->
製造工場において、多期間単一品目のロットサイズ生産計画と、時間帯別電気料金（TOU）・ピークデマンド料金・構内蓄電池を含む電力運用を同時に最適化します。製品在庫ゼロから出発し、ある期に生産を行うと固定段取り費と固定待機電力が発生し、ライン能力上限までの生産（単位あたり加工電力を消費）が可能になります。余剰製品は保管費を払って翌期へ繰り越せます。

工場の総電力需要は「基礎負荷 ＋ 段取り待機電力 ＋ 加工電力」となります。初期蓄電量から始まる蓄電池は定格電力内で充電または放電（同時充放電不可）を行い、充放電効率を伴いながら容量 $[0, E_{\max}]$ の範囲で推移し、最終期末には初期蓄電量以上へ戻す必要があります（系統への逆潮流は不可）。生産段取り・生産量・製品在庫・蓄電池運用を同時決定し、**生産・在庫・電力・デマンド料金の総コストを最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `demands` | `number[]` | 各期 $t$ の製品需要 $d_t$ |
| `setupCost` | `number` | 生産稼働 1 回あたりの固定段取り費 $F$ |
| `holdCost` | `number` | 期末製品在庫 1 単位・1 期あたり保管費 $h$ |
| `prodCap` | `number` | 1 期あたりの最大生産能力 $C_{\text{prod}}$ |
| `setupPower` | `number` | 稼働期の固定待機電力 $p_{\text{idle}}$ |
| `unitPower` | `number` | 製品 1 単位生産あたりの加工電力 $p_{\text{unit}}$ |
| `baseLoads` | `number[]` | 生産以外の工場基礎電力負荷 $L_t$ |
| `prices` | `number[]` | 各期 $t$ の時間帯別電気料金単価 $\pi_t$ |
| `demandCharge` | `number` | 最大買電電力 $\max_t g_t$ へのデマンド単価 $\gamma$ |
| `batteryCap` | `number` | 蓄電池容量上限 $E_{\max}$（下限は 0） |
| `initSoc` | `number` | 初期蓄電残量 $E_{\text{init}}$（最終期末 SOC 下限も兼ねる） |
| `maxPower` | `number` | 蓄電池の最大充放電電力 $P_{\max}$ |
| `etaCharge` | `number` | 充電効率 $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | 放電効率 $\eta_d \in (0, 1]$ |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `setups` | `number[]` | 各期の生産段取り有無（0 または 1） |
| `production` | `number[]` | 各期の非負生産量 |
| `inventory` | `number[]` | 各期の非負期末製品在庫 |
| `charge` | `number[]` | 各期の蓄電池充電電力 |
| `discharge` | `number[]` | 各期の蓄電池放電電力 |
| `soc` | `number[]` | 各期末の蓄電残量（`soc[T-1] >= initSoc`） |
| `peakLoad` | `number` | 期間中の最大系統買電電力 $\max_t g_t$ |
| `totalCost` | `number` | 最小化された生産＋電力総コスト |

<!-- section:example -->
**入力例**

```json
{
  "demands": [20, 35, 25, 30],
  "setupCost": 120,
  "holdCost": 1.5,
  "prodCap": 60,
  "setupPower": 10,
  "unitPower": 1.0,
  "baseLoads": [10, 85, 15, 90],
  "prices": [0.5, 2.0, 0.6, 2.2],
  "demandCharge": 8.0,
  "batteryCap": 80,
  "initSoc": 20,
  "maxPower": 35,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**出力例**

```json
{
  "setups": [1, 0, 1, 0],
  "production": [55, 0, 55, 0],
  "inventory": [35, 0, 30, 0],
  "charge": [8.597561, 0, 3.597561, 0],
  "discharge": [0, 1.402439, 0, 6.402439],
  "soc": [26.878049, 25.125, 28.003049, 20],
  "peakLoad": 83.597561,
  "totalCost": 1449.347561
}
```

安価な第 0・2 期にまとめて先行生産（`production = [55, 0, 55, 0]`）しつつ蓄電池を充電し、高料金の第 1・3 期に放電することで全期間の買電電力を 83.597561 に平準化し、総コスト $240 + 97.5 + 443.067073 + 668.780488 \approx$ **1,449.35** となります。


<!-- section:hint1 -->
同じ計画期間上で、単一品目ロットサイズ計画の変数（バイナリの段取り、連続生産量、製品在庫）と蓄電池運用の変数（充電、放電、バイナリの充放電モード、SOC、純受電電力、およびピーク電力スカラー変数）を組み合わせて定義します。

<!-- section:hint2 -->
2 つのサブシステムは各期の電力バランス `gridLoad[t] = baseLoads[t] + setupPower * setups[t] + unitPower * production[t] + charge[t] - discharge[t] >= 0` で結合されます。バイナリモード変数で充放電の同時発生を禁止し、SOC 変化には $\eta_c$ と $1 / \eta_d$ を適用し、最終期に `soc[T - 1] >= initSoc`、全期に `peakLoad >= gridLoad[t]` を課してください。
