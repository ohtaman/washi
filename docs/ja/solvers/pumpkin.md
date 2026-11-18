# Pumpkin 制約プログラミングソルバー

**Pumpkin** は、デルフト工科大学 ConSol Lab が純 Rust で開発している LCG（Lazy Clause Generation：遅延節生成）ベースの制約プログラミング（CP）ソルバーです。WaSHI では、Pumpkin（`v0.5.0`）を WebAssembly へ直接コンパイルし、追加の外部依存なしで利用できるプラグイン（`@ohtaman/washi/solvers/pumpkin`）として標準同梱しています。

マルチスレッド WASM を用いるソルバーとは異なり、Pumpkin はシングルスレッドの WASM として Web Worker（または Node.js メインプロセス）で実行されるため、ブラウザ側で **Cross-Origin Isolation（`COOP` / `COEP` ヘッダー）を設定せずに動作**します。

---

## Pumpkin を選ぶべき場面

1. **ジョブショップスケジューリングや組合せ整数モデル**:
   作業の順序選択（`implies(y, ...)`）や整数ドメイン伝播・節学習（nogood learning）が効くスケジューリングや配置問題。
2. **COOP / COEP 不要の Unsat Core 競合診断**:
   通常の Web ホスティング、CodePen、あるいは第三者 iframe 内（`SharedArrayBuffer` 不可環境）で、`await model.check({ solver: "pumpkin" })` による競合制約集合（`unsatCore` / `conflicts`）の抽出を行いたい場合。
3. **追加インストール不要のプラグイン**:
   `pumpkin.wasm`（約 906 kB）が `@ohtaman/washi` に同梱されているため、追加パッケージをインストールせずそのまま動作します。

> [!TIP]
> **HiGHS・Z3・Pumpkin の使い分け**:
> - **HiGHS** (`{ solver: "highs" }`): 連続変数を含む LP、凸 QP、線形緩和が強く効く大規模 MILP 向け。
> - **Pumpkin** (`{ solver: "pumpkin" }`): 有界整数変数＋命題論理モデル、および `COOP`/`COEP` 不要な `unsatCore` 抽出向け。
> - **Z3** (`{ solver: "z3" }`): 連続変数・実数係数を含む条件付き論理式や厳密な有理数 SMT 判定向け。

---

## 基本的な使い方

```typescript
import { Model, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
```

---

## 充足判定と Unsat Core（矛盾コア）の抽出 (`model.check()`)

`await model.check()` を使用すると、整数線形制約とネストした命題論理（`and`, `or`, `not`, `implies`, `xor`）の充足可能性を判定し、充足不能（`"Unsat"`）の場合に矛盾する名前付き制約の部分集合（`conflicts` / `unsatCore`）を取得できます：

```typescript
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("PolicyConflict", { solver: "pumpkin" });
const vip = model.bool("vip");
const seats = model.integer("seats", { lb: 0, ub: 20 });

model.constraint(vip, "vip_active");
model.constraint(implies(vip, expr`${seats} >= 8`), "vip_seats");
model.constraint(expr`${seats} <= 5`, "room_cap");

const result = await model.check();
if (result.status === "Unsat") {
  console.log("矛盾している制約:", result.conflicts); // result.unsatCore / model.unsatCore でも参照可能
}
```

---

## ドメイン制約・事前条件

Pumpkin は**有界整数・真偽値専用の CP/LCG ソルバー**です。非対応のモデル構文は暗黙に丸めたり別ソルバーへフォールバックせず、明示的なエラーを投げます：

- **有界整数 / Binary / BoolVar のみ対応**: すべての `Var` は有限整数上下界（`lb`, `ub` が `[-(2^30 - 1), 2^30 - 1]` の整数）である必要があります。無界整数（`-Infinity` / `Infinity`）や `Continuous` 変数はエラーになります。
- **整数係数の線形制約**: 制約の係数、調整済み右辺値（`rhs - lhs.constant`）、およびスケーリング上下界はすべて 32bit 安全範囲（`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`）の整数である必要があります（目的関数の定数項は小数可）。
- **ウォームスタート対応 (`initialValue`)**: 有界な `Integer` / `Binary` 変数に対して `solve()` と `check()` の双方で `initialValue` ヒント（`supportsWarmStart: true`）をサポートしており、Pumpkin の `WarmStart` brancher による探索ヒントとして適用されます（`Var.initialValue` は求解結果の `Var.value` とは独立して保持されます）。
- **非対応機能**: `QuadExpr`（二次式）および LP 緩和（`relax: true`）は明示的にエラーになります。グローバル制約（`distinct` や `noOverlap` など）は今後の別 Issue で順次拡張予定です。

---

## ブラウザ配信とカスタム WASM URL

通常は `@ohtaman/washi/solvers/pumpkin` が同梱の `pumpkin.wasm` を自動解決し、HTTP(S) オリジン下では `pumpkin-worker.js` を用いたバックグラウンド Web Worker で非同期実行します（`file://` や不透明オリジンのサンドボックス iframe ではメインスレッドで実行されます）。

`pumpkin.wasm` を独自のパスや CDN に配置する場合は以下のように指定できます：

```typescript
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

`pumpkin.wasm` の取得失敗や HTML フォールバック応答が返された場合、WaSHI は試行した URL を含めて即座にエラーを報告し、暗黙的な CDN フォールバックは行いません。

### WebAssembly アセットの管理とオンデマンドビルド

Pumpkin の WebAssembly バイナリ（`public/pumpkin.wasm`）と JS/TS ランタイム（`runtime.js` / `runtime.d.ts`）は、`pumpkin.config.json` により SHA-256 チェックサム付きでバージョン管理されています：
- **高速な整合性検証**: ビルドおよび配布パイプライン実行時に `node scripts/ensure-pumpkin-wasm.mjs` が走り、ミリ秒単位でローカルアセットを検証します。
- **オンデマンドダウンロード**: ファイルが存在しない場合やバージョン更新時は、`ensure-pumpkin-wasm.mjs` が WaSHI リポジトリの `pumpkin-v<version>` GitHub Release アセット（`pumpkin.config.json` の `downloadUrl`）から検証済みバイナリを自動取得します。
- **ソースからのコンパイル**: Pumpkin のバージョンアップや `wasm/pumpkin` 変更時は、`wasm32-unknown-unknown` ターゲット付き Rust 環境で（必要に応じて `node scripts/ensure-pumpkin-wasm.mjs --set-version <version>` で設定・`Cargo.toml` を更新したうえで）`npm run build:pumpkin-wasm` を実行し、`pumpkin-v<version>` の GitHub Release アセットへ反映します（`gh release upload pumpkin-v0.5.0 public/pumpkin.wasm src/modeler/solvers/pumpkin/runtime.js src/modeler/solvers/pumpkin/runtime.d.ts --clobber`、初回は `gh release create`、または `.github/workflows/build-pumpkin-wasm.yml` を実行して `pumpkin-wasm-assets` アーティファクトの変更をコミット）。
