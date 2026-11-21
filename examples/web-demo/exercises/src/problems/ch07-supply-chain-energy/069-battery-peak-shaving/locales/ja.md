# #069. 蓄電池のTOU最適運用とピークカット

<!-- section:scenario -->
時間帯別電気料金（TOU）と、計画期間全体の最大系統受電電力に対して課金されるデマンド料金（ピーク電力料金）のもとで、事業所併設の蓄電池を最適制御します。各期間では出力上限以内で充電または放電（同時充放電は不可）を行い、系統からの買電電力は「基礎負荷 ＋ 充電 − 放電」（逆潮流なしの非負）となります。

充電時は充電効率 $\eta_c$ を乗じた量だけ蓄電量（SOC）が増え、放電時は放電電力の $1/\eta_d$ だけ SOC が減少します。各期の SOC 上下限および最終期末の目標下限を守りつつ、**電力量料金とピークデマンド料金の合計を最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `baseLoads` | `number[]` | 各期 $t$ の施設基礎電力負荷 $L_t$ |
| `prices` | `number[]` | 各期 $t$ の買電単価 $\pi_t$ |
| `demandCharge` | `number` | 最大買電電力 $\max_t g_t$ に対するデマンド単価 $\gamma$ |
| `capacity` | `number` | 蓄電池の最大容量上限 $E_{\max}$ |
| `minSoc` | `number` | 蓄電残量（SOC）の下限 $E_{\min}$ |
| `initSoc` | `number` | 第 0 期開始前の初期蓄電残量 $E_{\text{init}}$ |
| `minFinalSoc` | `number` | 最終期末に確保すべき最低 SOC $E_{\text{end}}$ |
| `maxPower` | `number` | 充放電の定格最大電力 $P_{\max}$ |
| `etaCharge` | `number` | 充電効率 $\eta_c \in (0, 1]$ |
| `etaDischarge` | `number` | 放電効率 $\eta_d \in (0, 1]$ |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `charge` | `number[]` | 各期の充電電力（$0 \dots P_{\max}$） |
| `discharge` | `number[]` | 各期の放電電力（$0 \dots P_{\max}$） |
| `soc` | `number[]` | 各期末の蓄電残量（$E_{\min} \dots E_{\max}$） |
| `peakLoad` | `number` | 期間中の最大系統買電電力 $\max_t (L_t + c_t - d_t)$ |
| `totalCost` | `number` | 最小化された電力量料金＋デマンド料金 |

<!-- section:example -->
**入力例**

```json
{
  "baseLoads": [40, 50, 80, 110, 95, 55],
  "prices": [0.1, 0.12, 0.25, 0.35, 0.28, 0.12],
  "demandCharge": 8,
  "capacity": 80,
  "minSoc": 10,
  "initSoc": 30,
  "minFinalSoc": 30,
  "maxPower": 30,
  "etaCharge": 0.8,
  "etaDischarge": 0.8
}
```

**出力例**

```json
{
  "charge": [30, 30, 0, 0, 0, 25],
  "discharge": [0, 0, 0, 30, 24.4, 0],
  "soc": [54, 78, 78, 40.5, 10, 30],
  "peakLoad": 80,
  "totalCost": 733.968
}
```

安価な時間帯に `soc = 78` まで充電し、高負荷の 3〜4 期に放電して買電電力を `[70, 80, 80, 80, 70.6, 80]`（`peakLoad = 80`）に抑えると、最終 SOC 30 を保ったまま総コスト $93.968 + 8 \times 80 =$ **733.968** となります。


<!-- section:hint1 -->
各期ごとに、充電電力、放電電力、期末充電状態（SOC）、および系統からの純受電電力を表す連続変数と、同時充放電を防ぐためのバイナリモード変数を定義し、さらにピーク受電電力を表すスカラー変数を 1 つ用意します。

<!-- section:hint2 -->
SOC の遷移式では充電が $\eta_c c_t$ を加算し放電が $d_t / \eta_d$ を減算し、純受電電力は `baseLoads[t] + charge[t] - discharge[t] >= 0` を満たします。充電と放電をバイナリモード変数で排他制御し（`charge[t] <= maxPower * mode[t]` と `discharge[t] <= maxPower * (1 - mode[t])`）、最終期の SOC 下限を $\max(\text{minSoc}, \text{minFinalSoc})$ とした上で、全期について `peakLoad >= gridLoad[t]` を課してデマンド料金を線形化してください。
