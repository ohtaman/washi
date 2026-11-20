# AI コーディングエージェントでの開発

このガイドでは、AI コーディングエージェント（Claude Code, Cursor, Codex, Antigravity, Gemini CLI, Windsurf）を使って `@ohtaman/washi` の数理最適化・制約プログラミングモデルを定式化・求解・検証し、ツールやアプリとしてパッケージングする手順を説明します。

---

## 1. セットアップ

AI コーディングエージェントで WaSHI を使う準備は、「プロジェクトへのランタイム導入」と「エージェントへの API・検証ワークフローの付与」の2つに分かれます。

### ランタイムライブラリのインストール

標準の **HiGHS**（LP / MIP / 凸QP）と **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`、CP / LCG）は外部依存ゼロでパッケージに同梱されています：

```bash
npm install @ohtaman/washi

# 連続変数の SMT 論理制約や GLPK を使う場合のみオプション追加:
# npm install z3-solver
# npm install glpk.js
```

### コーディングエージェントへの連携

使用しているツールに合わせて以下のいずれかを設定します：

- **Agent Skill（推奨 — Claude Code, Cursor, Codex, Antigravity, Gemini CLI）**:
  ```bash
  npx skills add ohtaman/washi
  ```
  `skills/washi/SKILL.md`（`node_modules/@ohtaman/washi/skills/washi/SKILL.md` にも同梱）がインストールされ、問題クラスに応じたソルバー選択（HiGHS / Pumpkin / Z3 / GLPK）、`expr` による定式化、`m.toLpString()` による式確認、`m.verify()` による解の検証、`m.check()` による競合診断の一連の手順がエージェントに共有されます。
- **IDE ドキュメントインデックス（Cursor, Windsurf 等の `@Docs`）**:
  - ドキュメント目次: `https://washi.ohtaman.dev/llms.txt`
  - 単一ファイルの全リファレンス・例題集: `https://washi.ohtaman.dev/llms-full.txt`
- **Context7 MCP**:
  - ライブラリ ID: `/ohtaman/washi`

---

## 2. 最初のエンドツーエンド実行

`@ohtaman/washi` をインストールした Node.js / TypeScript プロジェクトで、以下のスタータープロンプトをコーディングエージェントに入力します：

```text
@ohtaman/washi を使って、社内勉強会の LT 発表 8 件を 2 会場（Room A, Room B）× 4 タイムスロットに割り当てる TypeScript スクリプトを作成して実行してください。
入力データ: 発表者、トピック（"infra", "frontend", "data", "security"）、参加不可スロットを持つサンプル配列を用意してください。
要件:
1. 各発表をちょうど 1 つの会場・スロットに割り当て、各会場・スロットには最大 1 件とする。
2. 発表者の参加不可スロットを避け、同一発表者が同じ時間帯に複数会場へ割り当てられないようにする。
3. 同じ時間帯の裏番組で同一トピックが重なる件数を最小化する。
4. すべての制約に分かりやすい名前を付け、同梱の HiGHS で求解し、m.hasPrimalSolution と m.verify().valid === true を確認してから時間割表を表示する。
```

このプロンプトを実行すると、エージェントはローカル環境で次の3ステップを行います：

1. **モデルの定式化**: 上下限付きの二値変数（`m.binary`）、数式（`` expr`...` ``, `sum`）、名前付き制約（`m.constraint(..., "name")`）、目的関数（`m.objective(minimize(...))`）を組み立てます。
2. **Node.js 上の WebAssembly での求解**: 同梱の HiGHS WebAssembly バイナリを用いてスクリプト（`npx tsx schedule.ts` など）をそのまま実行します。Python 環境やネイティブソルバーのインストールは不要です。
3. **解の独立検証**: `m.hasPrimalSolution` を確認した上で `m.verify()` を呼び出し、変数の上下限・整数性・すべての制約条件を満たしていることを検証してから結果を出力します。

---

## 3. 問題クラス別の実用プロンプト例

WaSHI が対応する代表的な問題クラスごとのプロンプトテンプレートです。入力データの項目や制約条件を手元の題材に合わせて書き換えて使用してください。

### イベント時間割・レビュアー割り当て（MILP — 同梱 HiGHS）

```text
@ohtaman/washi（同梱 HiGHS）を使って、24 件の設計ドキュメント / PR レビュー依頼を 6 名のエンジニアへ割り当て、各依頼に異なる 2 名のレビュアーを付けてください。
条件:
- 作成者本人は自分の依頼をレビューできず、レビュアーは依頼が要求する領域タグを少なくとも 1 つ満たすこと。
- 各エンジニアの上限件数を守りつつ、最も担当件数が多いエンジニアの負荷を最小化すること（Min-Max 負荷平準化）。
- すべての制約に名前を付けてスクリプトを実行し、m.hasPrimalSolution と m.verify().valid === true を検証してください。
```

### 予算・プロジェクトポートフォリオ選択（0-1 MIP — 同梱 HiGHS）

```text
@ohtaman/washi（同梱 HiGHS）を使って、候補プロジェクト一覧（JSON）から年間削減効果の合計を最大化する組み合わせを選択してください。
各プロジェクトは cost, backend_engineers, frontend_engineers, savings を持ちます。
条件:
- 四半期予算合計 120 以下、バックエンド 14 人月以下、フロントエンド 10 人月以下に収める。
- 前提依存: "billing_v2" を採択する場合は "auth_token_service" も必ず採択する。
- 排他条件: "legacy_search_tuning" と "vector_search_migration" は同時に最大 1 件までとする。
- すべての制約に明確な名前を付け、m.verify().valid === true を確認してください。
```

### 先行順序・共有リソース制約付きタスクスケジューリング（CP/LCG — 同梱 Pumpkin）

```text
@ohtaman/washi と同梱の CP ソルバー（@ohtaman/washi/solvers/pumpkin）を使って、10 個のリリース工程タスク（整数の開始時刻 lb: 0, ub: 120、固定所要時間）の完了時刻（メイクスパン）を最小化してください。
条件:
- 依存タスク間の終了→開始の先行順序制約を守る。
- ステージング検証クラスタを使うタスク同士は時間帯が重ならないようにする（disjoint を使用）。
- 全タスクが同時に消費する共有 CI ランナー数の合計が常時 4 以下になるようにする（cumulative を使用）。
- { solver: "pumpkin" } で求解し、m.hasPrimalSolution と m.verify().valid === true を確認して各タスクの開始・終了時刻を表示してください。
```

### 目標配分への追従・分散最小化（凸 QP — 同梱 HiGHS）

同梱の HiGHS は連続変数（`m.continuous`）からなる凸二次目的関数を求解できます：

```text
@ohtaman/washi（同梱 HiGHS）を使って、総予算 1.0 を 5 つのリージョン計算プールへ m.continuous 変数（lb: 0.05, ub: 0.50）で配分してください。
目標比率は [0.30, 0.25, 0.20, 0.15, 0.10] とし、リージョン 0 と 1 の合計は 0.48 以下という上限を設けます。
sum(w) == 1.0 と上限条件のもとで二乗誤差和 expr`sum((${w} - ${target})^2)` を最小化し、m.verify().valid === true を確認してください。
```

### ルール・設定の矛盾診断（実行不能判定 / Unsat Core）

```text
@ohtaman/washi と @ohtaman/washi/solvers/pumpkin を使って、有界整数変数と論理変数からなるデプロイ・機能フラグ設定ルール群が充足可能かどうかを await m.check({ solver: "pumpkin" }) で検査してください。
意図的に矛盾する名前付きルールを含むテストケースを用意し、res.status と res.unsatCore（または res.conflicts）を出力して、どのルール同士が衝突しているかを表示してください。
```

> [!NOTE]
> `await m.check()` は標準の **HiGHS** でもそのまま動作します（スラック緩和により競合する制約名を `res.conflicts` に返します）。`COOP`/`COEP` ヘッダー不要で有界整数・真偽値モデルの `res.unsatCore` を抽出したい場合は同梱の `@ohtaman/washi/solvers/pumpkin` をインポートし、連続変数や実数係数を含む SMT 論理で厳密な `unsatCore` が必要な場合は `z3-solver`（`@ohtaman/washi/solvers/z3`）を使用してください。

---

## 4. アプリ化・配布用プロンプト（単一 HTML・デスクトップ・モバイル）

CLI スクリプトで定式化と検証が完了したら、同じモデルをサーバー不要の単一 HTML ツールやオフラインのデスクトップ・モバイルアプリにパッケージングするようエージェントに指示できます。

### サーバー不要の単一 `.html` ツール（`file://` ダブルクリック起動）

```text
この @ohtaman/washi の最適化モデルを、HTML・CSS・JavaScript を 1 ファイルにまとめた単一のスタンドアロン .html ツールにして、チームメンバーが file:// のダブルクリックだけで開けるようにしてください。
- WaSHI は https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js（グローバル変数 window.Washi）から読み込むこと。
- CSV / テキスト入力欄、「最適化を実行」ボタン、結果テーブル、およびステータスが "Infeasible" の場合に await m.check() で競合ルールを表示する診断欄を用意すること。
- 解が得られた場合は必ず m.verify() で検証すること。
```

- **`file://` 実行時の技術仕様**:
  - HTTPS CDN から `washi.min.js`（Pumpkin 利用時は `solvers/pumpkin.min.js` も追加）を読み込む構成では、ローカル `.html` を `file://`（HTTP サーバーなし）で直接開いてもそのまま動作します。不透明オリジン（`window.origin === "null"`）を検出すると、WaSHI が自動的にメインスレッド実行へ切り替えるためです。
  - ローカルに配置した `.wasm` ファイルの相対読み込み（`file://` ではブラウザの `fetch()` CORS 制約でブロックされます）や **Z3**（`COOP`/`COEP` ヘッダーと `SharedArrayBuffer` が必須）を使う場合は、`http://` または `https://` サーバー経由で配信してください。

### オフラインのデスクトップ・モバイルアプリ（Vite + Tauri / Capacitor / PWA）

```text
この Vite + TypeScript の @ohtaman/washi アプリを、バックエンドサーバー不要・C++ ソルバーのネイティブビルド不要でオフライン動作するデスクトップ / モバイルアプリとして構成してください（同梱の HiGHS または @ohtaman/washi/solvers/pumpkin を使用）。
- ソルバー実行はすべて @ohtaman/washi によるクライアント内完結とすること。
- Content Security Policy で WebAssembly の実行（script-src に 'wasm-unsafe-eval'）および Web Worker（worker-src 'self' blob:）を許可すること。
```

- **WebView 環境の技術仕様**: 標準の Vite ビルド成果物は `highs.wasm` や `pumpkin.wasm` を静的アセットとして同梱するため、Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor のモバイル WebView、オフライン対応 PWA 内でそのまま動作します。`tauri.conf.json` の CSP 設定（`'wasm-unsafe-eval'` 等）の詳細は [ランタイム環境設定](./runtimes.md) を参照してください。

---

## 5. エージェントとの反復改善とデバッグ

- **制約への明示的な命名と `m.verify()` の徹底**: すべての `m.constraint(c, "rule_name")`（および `m.indicator(...)` の `name`）に意味のある一意な名前を付け、求解後に必ず `m.verify().valid === true` を確認するようエージェントに指示してください。名前を省略すると自動採番（`c_0`, `c_1`）になり、競合診断結果の解釈が難しくなります。
- **`"Infeasible"`（解なし）発生時は `m.check()` で原因を特定する**: 要件追加によって解が見つからなくなった場合は、次のような追加プロンプトが有効です：
  ```text
  新しい条件を追加したところ m.solve() が "Infeasible" になりました。
  await m.check()（有界整数・真偽値モデルなら await m.check({ solver: "pumpkin" })）を実行して res.conflicts / res.unsatCore を出力し、どの名前付きルールや変数の上下限が矛盾しているかを説明した上で、どの条件を非負スラック変数付きのソフト制約（ペナルティ項）に緩和すべきか提案してください。
  ```
- **本番利用前の `m.toLpString()` と変数上下限の確認**: 小規模なテストデータで `m.toLpString()` を出力させ、変数の `lb` / `ub`（特に `M` 省略時の `m.indicator()` 内で参照される変数には有限の上下限が必須）、目的関数の向き（`Maximize` / `Minimize`）、不等号の向き（`<=` / `>=`）が意図通りか確認してください。
