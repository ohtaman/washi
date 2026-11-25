# セキュリティポリシーと論理検証 (Z3 SMT)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 命題論理・SMT 充足可能性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `implies()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=smt_security">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">ソースコード</a></li></ul> |

**SMT（Satisfiability Modulo Theories）** は、命題論理に、整数の範囲制約や線形不等式などの背景理論を組み合わせて充足可能性を判定する枠組みです。

この例では、WaSHI と Z3 を使ってスマートホームのセキュリティルールを検証し、センサー観測値からシステム状態を推論します。

## シナリオ

センサー観測値と論理ルールからなるセキュリティシステムをモデル化します。
1. 周囲の照度（`luxLevel`）が `50 lux` 以下であれば、夜間モード（`isNight`）にする。
2. 夜間（`isNight`）に動体検知（`motionDetected`）があり、かつアラームが警戒中（`alarmArmed`）であれば、サイレン（`sirenActive`）を鳴らす。
3. アラームが警戒中（`alarmArmed`）であれば、玄関ドアは解錠状態（`frontDoorUnlocked`）にしない。
4. 夜間（`isNight`）に動体検知（`motionDetected`）があれば、足元照明（`lightsOn`）を点灯する。

ここでは `luxLevel <= 20`、`alarmArmed`、`motionDetected` という観測状態のもとで、まずシステムの状態を推論します。続いて、この条件下ではサイレン（`sirenActive`）が鳴らない状態になり得ないことを形式的に証明します。

## WaSHI による実装

> [!NOTE]
> **Z3 の前提条件:** `@ohtaman/washi/solvers/z3` を使うには、任意の `peerDependencies` パッケージ `z3-solver`（`npm install z3-solver`）が必要です。ブラウザ上で Z3 を実行する場合は `COOP` / `COEP` ヘッダーも必要になります（詳しくは [Cross-Origin Isolation](../getting-started/cross-origin.md) を参照してください）。

<CodeRunner preset="smt_security">

```typescript
import { Model, implies, not, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartHomeSecurity", solver: "z3" });

  // 1. 命題論理変数（真偽値）
  const isNight = m.bool("isNight");
  const motionDetected = m.bool("motionDetected");
  const alarmArmed = m.bool("alarmArmed");
  const frontDoorUnlocked = m.bool("frontDoorUnlocked");
  const sirenActive = m.bool("sirenActive");
  const lightsOn = m.bool("lightsOn");

  // 2. 数値変数（照度センサー値 [lux]）
  const luxLevel = m.integer("luxLevel", { lb: 0, ub: 1000 });

  // ルール 1: luxLevel <= 50 ならば isNight
  m.constraint(implies(expr`${luxLevel} <= 50`, isNight), "dark_implies_night");

  // ルール 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.constraint(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // ルール 3: alarmArmed => NOT(frontDoorUnlocked)
  m.constraint(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // ルール 4: (motionDetected AND isNight) => lightsOn
  m.constraint(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. 観測されたセンサー値と設定状態
  m.constraint(expr`${luxLevel} <= 20`, "sensor_reading_dark");
  m.constraint(alarmArmed, "user_armed_alarm");
  m.constraint(motionDetected, "sensor_motion_triggered");

  // 充足可能性を判定しシステム状態を推論
  const res = await m.check();

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. 安全性プロパティの形式検証（反例探索 / 背理法）:
  // この状況下で「サイレンが鳴らない (not(sirenActive))」という抜け道が存在しないことを証明
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check();
  console.log(`Can siren stay off? ${proof.status} (Proven safe when Unsat)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## 実務上のポイント

### 背理法による形式検証（反例探索）

1 回の `m.check()` で `"Sat"` が返っても、「条件を満たす状態が少なくとも 1 つ存在する」ことしか分かりません。安全性要件 `P`（例: `sirenActive`）が常に成立することを証明するには、否定の `not(P)` を追加して `m.check()` を実行します。`"Unsat"` なら反例は存在せず、`"Sat"` なら得られた変数値が具体的な抜け道（反例）を示します。

本例では、最初の判定が `"Sat"` となり、`sirenActive = true`、`lightsOn = true`、`isNight = true`、玄関施錠が導かれます。続いて `not(sirenActive)` を追加すると `"Unsat"` と 6 本のルールからなる証明コアが返り、無関係な `lock_safety_rule` と `comfort_lights` は自動的に除外されます。

### 片方向の含意（`implies`）と双方向同値の違い

`` implies(expr`${luxLevel} <= 50`, isNight) `` が制約するのは、`luxLevel <= 50` が真のときの `isNight` だけです。`luxLevel > 50` のときは `isNight` に制限がかからず、`true`・`false` いずれの値も取り得ます。必要十分条件（双方向同値）として定義したい場合は、逆の `` implies(isNight, expr`${luxLevel} <= 50`) ``（あるいは論理的に同値な裏の `` implies(expr`${luxLevel} >= 51`, not(isNight)) ``）も追加します。

### 離散モデル向けの代替ソルバー

このモデルの変数は `BoolVar` と有界整数（`luxLevel` は `[0, 1000]`）のみです。そのため、同梱の `@ohtaman/washi/solvers/pumpkin` を読み込んで `m.check({ solver: "pumpkin" })` を実行すれば、同じ推論と反例検証ができます。
