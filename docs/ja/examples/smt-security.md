# セキュリティポリシーと論理検証 (Z3 SMT)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 命題論理・SMT 充足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.bool()`, `m.integer()`, `m.constrain()`, `expr`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts">ソースコード</a></li></ul> |

真偽値変数（`BoolVar`）と数値変数（`Var`）を組み合わせ、「もし照度が 50 以下なら夜間モードにする (`lux.le(50).implies(isNight)`)」といった複合的な業務ルール・セキュリティポリシーの充足性を Z3 ソルバーで検証します。

## WaSHI による実装

<CodeRunner preset="smt_sat_scheduling">

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartSecurityRules", solver: "z3" });

  const isNight = m.bool("isNight");
  const motion  = m.bool("motion");
  const alarm   = m.bool("alarm");
  const siren   = m.bool("siren");
  const lux     = m.integer("lux", { lb: 0 });

  // 論理ルール
  m.constrain(lux.le(50).implies(isNight), "dark_implies_night");
  m.constrain(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

  // センサー観測値
  m.constrain(expr`${lux} <= 10`, "sensor_dark");
  m.constrain(motion, "sensor_motion");
  m.constrain(alarm, "alarm_on");

  const res = await m.check({ solver: "z3" });
  console.log(`Status: ${res.status}`);
  console.log(`isNight: ${isNight.value}, Siren active: ${siren.value}`);
}

verifySecurityRules();
```

</CodeRunner>
