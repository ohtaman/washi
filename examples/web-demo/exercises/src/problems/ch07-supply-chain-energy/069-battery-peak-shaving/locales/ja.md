# #069. 蓄電池のTOU最適運用とピークカット

<!-- section:scenario -->
時間帯別電気料金（TOU）とピークデマンド料金のもとで、1 時間単位の複数期間（電力 kW がそのまま 1 時間あたりの電力量 kWh に一致）にわたり事業所併設の蓄電池を運用します。

- **充放電出力と排他制約**: 各期間では定格電力上限以内で充電または放電のいずれか一方のみを行えます（同時充放電は不可）。
- **系統買電電力**: 各期の系統買電電力は「基礎負荷 ＋ 充電 − 放電」で定まり、逆潮流なしで非負を保つ必要があります。
- **充放電効率と蓄電残量（SOC）**: 充電時は充電電力に充電効率を乗じた分だけ蓄電残量（SOC）が増え、放電時は放電電力を放電効率で割った分だけ減少します。各期末の SOC は上下限の範囲内に収め、最終期末には目標下限以上を確保します。
- **ピークデマンド料金**: 計画期間全体における最大の系統買電電力に対してデマンド単価が課金されます。

各期の充電・放電、蓄電残量（SOC）の推移、および最大系統買電電力を決定し、**電力量料金とピークデマンド料金の合計を最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `baseLoads` | `number[]` | 各 1 時間期間の施設基礎電力負荷（kW、1 期あたり kWh と等価） |
| `prices` | `number[]` | 各期の時間帯別買電単価（1 kWh あたり） |
| `demandCharge` | `number` | 期間全体の最大系統買電電力に対するデマンド単価（1 kW あたり） |
| `capacity` | `number` | 蓄電池の最大容量（kWh） |
| `minSoc` | `number` | 蓄電残量（SOC）の下限（kWh） |
| `initSoc` | `number` | 第 0 期開始前の初期蓄電残量（SOC、kWh） |
| `minFinalSoc` | `number` | 最終期末に確保すべき最低蓄電残量（SOC、kWh） |
| `maxPower` | `number` | 1 期あたりの充放電定格最大電力（kW） |
| `etaCharge` | `number` | 充電効率（(0, 1] の範囲） |
| `etaDischarge` | `number` | 放電効率（(0, 1] の範囲） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `charge` | `number[]` | 各期の充電電力（kW、0 〜 `maxPower`） |
| `discharge` | `number[]` | 各期の放電電力（kW、0 〜 `maxPower`） |
| `soc` | `number[]` | 各期末の蓄電残量（SOC、kWh、`minSoc` 〜 `capacity`） |
| `peakLoad` | `number` | 期間中の最大系統買電電力（kW） |
| `totalCost` | `number` | 最小化された電力量料金＋ピークデマンド料金 |

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

安価な時間帯に `soc = 78` まで充電し、高負荷の 3〜4 期に放電して系統買電電力を [70, 80, 80, 80, 70.6, 80]（`peakLoad = 80`）に抑えると、最終蓄電残量（SOC）30 を保ったまま、電力量料金 93.968 とデマンド料金 $8 \times 80$ の合計で総コスト $93.968 + 8 \times 80 =$ **733.968** となります。


<!-- section:hint1 -->
各期ごとに、充電電力、放電電力、期末の蓄電残量（SOC）、および系統買電電力を表す連続変数と、同時充放電を防ぐためのバイナリモード変数を定義し、さらに最大系統買電電力を表すスカラー変数を 1 つ用意します。

<!-- section:hint2 -->
蓄電残量（SOC）の遷移式では充電が `etaCharge * charge[t]` を加算し放電が `discharge[t] / etaDischarge` を減算します。補助変数として非負の系統買電電力 `gridLoad[t]`（`baseLoads[t] + charge[t] - discharge[t]`）とバイナリモード変数 `mode[t]` を導入し、充放電を排他制御（`charge[t] <= maxPower * mode[t]` と `discharge[t] <= maxPower * (1 - mode[t])`）した上で、最終期の SOC 下限を `max(minSoc, minFinalSoc)` とし、全期について `peakLoad >= gridLoad[t]` を課してデマンド料金を線形化してください。
