# セキュリティポリシーと論理検証 (Z3 SMT)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 命題論理・SMT 充足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `m.constraint()`, `expr`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_security">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">ソースコード</a></li></ul> |

真偽値変数（`BoolVar`）と数値変数（`Var`）を組み合わせ、「もし照度が 50 以下なら夜間モードにする (`luxLevel.le(50).implies(isNight)`)」といった複合的な業務ルール・セキュリティポリシーの充足性を Z3 ソルバーで検証します。

## シナリオ

センサー観測値と論理ルールからなるスマートホームのセキュリティシステムをモデル化します：
1. 周囲の照度が $\le 50$ のとき、夜間モード（`isNight`）と判定する。
2. 夜間に動体検知があり、かつアラームが警戒中であれば、サイレン（`sirenActive`）を鳴らさなければならない。
3. アラームが警戒中であれば、玄関ドアは決して解錠状態（`frontDoorUnlocked`）であってはならない。
4. 夜間に動体検知があった場合、足元照明（`lightsOn`）を点灯する。

## WaSHI による実装

<CodeRunner preset="smt_security">

```typescript
import { Model, not, expr } from "@ohtaman/washi";
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

  // 2. 数値メトリクス（照度センサー lux）
  const luxLevel = m.integer("luxLevel", { lb: 0, ub: 1000 });

  // ルール 1: luxLevel <= 50 ならば isNight
  m.constraint(luxLevel.le(50).implies(isNight), "dark_implies_night");

  // ルール 2: (motionDetected AND isNight AND alarmArmed) => sirenActive
  m.constraint(
    motionDetected.and(isNight).and(alarmArmed).implies(sirenActive),
    "intrusion_rule"
  );

  // ルール 3: alarmArmed => NOT(frontDoorUnlocked)
  m.constraint(alarmArmed.implies(not(frontDoorUnlocked)), "lock_safety_rule");

  // ルール 4: (motionDetected AND isNight) => lightsOn
  m.constraint(motionDetected.and(isNight).implies(lightsOn), "comfort_lights");

  // 3. 観測されたコンテキスト状態
  m.constraint(expr`${luxLevel} <= 20`, "sensor_reading_dark");
  m.constraint(alarmArmed, "user_armed_alarm");
  m.constraint(motionDetected, "sensor_motion_triggered");

  // 充足可能性を判定しシステム状態を推論
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`);
  console.log(`Siren Active : ${sirenActive.value}`);
  console.log(`Lights On    : ${lightsOn.value}`);
  console.log(`Door Locked  : ${frontDoorUnlocked.value ? "No" : "Yes"}`);
  console.log(`Is Night     : ${isNight.value}`);

  // 4. 安全性プロパティの形式検証（反例探索 / 背理法）:
  // この状況下で「サイレンが鳴らない (not(sirenActive))」という抜け道が存在しないことを証明
  m.constraint(not(sirenActive), "counterexample_siren_off");
  const proof = await m.check({ solver: "z3" });
  console.log(`Can siren stay off? ${proof.status} (Unsat なら抜け道なしと証明完了)`);
  console.log(`Active proof core : ${(proof.conflicts ?? []).join(", ")}`);
}

verifySecurityRules();
```

</CodeRunner>

## 実務上のポイント

- **背理法による形式検証（反例探索）**: 単一の `check()` で `"Sat"` が返ることは「条件を満たす状態が少なくとも1つ存在する」ことを意味します。ある安全性要件 $P$（例：`sirenActive`）が**いかなる場合も必ず成立する（抜け道がない）**ことを形式的に証明するには、あえて否定 `not(P)` を追加して `m.check()` を実行し、`"Unsat"` になることを確認します。もし `"Sat"` が返れば、そのときの変数値が具体的なセキュリティ上の抜け道（反例）となります。
- **片方向の含意（`implies`）と双方向同値の違い**: `luxLevel.le(50).implies(isNight)` は「照度 50 以下なら夜」しか規定しないため、昼間（`luxLevel > 50`）のときに `isNight` が `true` になっても論理的には違反になりません（オープンワールド仮定）。「照度 50 以下 $\iff$ 夜」とする場合は、逆方向の `luxLevel.ge(51).implies(not(isNight))` も併せて記述します。
