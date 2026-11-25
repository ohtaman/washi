# AI コーディングエージェントでの開発

このガイドでは、AI コーディングエージェントを使って `@ohtaman/washi` による最適化・制約充足モデルの構築、検証、およびアプリとしてのパッケージング手順を説明します。対象ツールは Claude Code、Cursor、Codex、Antigravity、Gemini CLI、Windsurf などです。

---

## 1. セットアップ

AI コーディングエージェントで WaSHI を使う準備は 2 段階に分かれます。まずプロジェクトにランタイムライブラリを導入し、次にエージェントへ WaSHI の API リファレンスと検証手順を組み込みます。

### ランタイムライブラリのインストール

`@ohtaman/washi` には、線形・混合整数・凸二次計画（`LP`/`MIP`/`QP`）向けの **HiGHS** が同梱されています。さらに、制約プログラミング（`CP`）向けの **Pumpkin** も外部依存ゼロで同梱されています：

```bash
npm install @ohtaman/washi

# SMT ソルバー（Z3：連続変数の論理制約など）や GLPK を使う場合のみ追加:
# npm install z3-solver
# npm install glpk.js
```

### コーディングエージェントとの連携

使用しているツールに合わせて連携方法を選びます：

| 連携方法 | 対象ツール | 設定手順 |
| --- | --- | --- |
| **Agent Skill** *(推奨)* | Claude Code、Cursor、Codex、Antigravity、Gemini CLI | `npx skills add ohtaman/washi` を実行 |
| **IDE `@Docs` 登録** | Cursor、Windsurf | `https://washi.ohtaman.dev/llms.txt` または `https://washi.ohtaman.dev/llms-full.txt` を追加 |
| **Context7 MCP** | MCP 対応エージェント | ライブラリ ID `/ohtaman/washi` を指定 |

Agent Skill を導入すると、エージェントのスキルディレクトリに `SKILL.md` が配置されます。これにより、ソルバー選定、`expr` を使ったモデリング、`m.toLpString()`・`m.verify()`・`m.check()` による検証手順がエージェントに共有されます。

---

## 2. 最初のエンドツーエンド実行

`@ohtaman/washi` を導入した Node.js / TypeScript プロジェクトで、次のスタータープロンプトをエージェントに入力します：

```text
@ohtaman/washi を使って、社内勉強会の LT 発表 8 件を 2 会場（Room A, Room B）× 4 タイムスロットに割り当てる TypeScript スクリプトを作成して実行してください。
入力データ: 発表者、トピック（"infra", "frontend", "data", "security"）、参加不可スロットを持つサンプル配列を用意してください。
要件:
1. 各発表をちょうど 1 つの会場・スロットに割り当て、各会場・スロットには最大 1 件とする。
2. 発表者の参加不可スロットを避け、同一発表者が同じ時間帯に複数会場へ割り当てられないようにする。
3. 同じ時間帯の別会場で同一トピックが重なる件数を最小化する。
4. すべての制約に分かりやすい名前を付け、同梱の HiGHS で求解し、m.hasPrimalSolution と m.verify().valid === true を確認してから時間割を表示する。
```

このプロンプトを渡すと、エージェントはローカル環境で次の 3 ステップを実行します：

1. **モデルの定式化**: `m.binary()` で 0-1 変数を宣言し、`` expr`...` `` と `sum()` で数式・名前付き制約・最小化する目的関数を組み立てます。
2. **Node.js 上での WebAssembly 求解**: `npx tsx schedule.ts` 等でスクリプトを実行し、同梱の HiGHS バイナリで求解します。Python 環境やネイティブソルバーの導入は不要です。
3. **解の独立検証**: `m.hasPrimalSolution` を確認して `m.verify()` を呼び出し、出力前に変数の上下限・整数性・制約の充足を検証します。

---

## 3. 問題クラス別の実用プロンプト例

解決したい課題に合う問題クラスとソルバーを下の表から選び、該当するプロンプト例を書き換えて使ってください：

| 問題クラス | 推奨ソルバー | 主な API |
| --- | --- | --- |
| 割当・時間割・0-1 選択（`MILP` / `0-1 MIP`） | 同梱 **HiGHS** | `m.binary()`, `sum()`, `dot()` |
| 共有リソース付きタスクスケジューリング（`CP`） | 同梱 **Pumpkin** | `disjoint()`, `cumulative()`, `distinct()` |
| 目標配分への合わせ込み・分散最小化（凸 `QP`） | 同梱 **HiGHS** | `m.continuous()`, `` expr`...^2` `` |
| ルール矛盾の診断（`unsatCore`） | 同梱 **Pumpkin** または **Z3** | `m.check()` |

### レビュアー割当・負荷平準化（MILP — 同梱 HiGHS）

```text
@ohtaman/washi（同梱 HiGHS）を使って、設計ドキュメントや PR のレビュー依頼 24 件を 6 名のエンジニアへ割り当て、各依頼に異なる 2 名のレビュアーを付けてください。
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
- 四半期予算の合計を 120 以下、バックエンド 14 名以下、フロントエンド 10 名以下に収める。
- 前提依存: "billing_v2" を採択する場合は "auth_token_service" も必ず採択する。
- 排他条件: "legacy_search_tuning" と "vector_search_migration" は同時に最大 1 件までとする。
- すべての制約に明確な名前を付け、m.verify().valid === true を確認してください。
```

### 先行順序・共有リソース制約付きタスクスケジューリング（CP — 同梱 Pumpkin）

```text
@ohtaman/washi と同梱の CP ソルバー（@ohtaman/washi/solvers/pumpkin）を使って、10 件のリリース工程タスク（整数の開始時刻 lb: 0, ub: 120、固定所要時間）全体の完了時刻（メイクスパン）を最小化してください。
条件:
- 依存タスク間の終了→開始の先行順序制約を守る。
- ステージング検証クラスタを使うタスク同士は時間帯が重ならないようにする（disjoint を使用）。
- 全タスクが同時に消費する共有 CI ランナー数の合計が常時 4 以下になるようにする（cumulative を使用）。
- { solver: "pumpkin" } で求解し、m.hasPrimalSolution と m.verify().valid === true を確認して各タスクの開始・終了時刻を表示してください。
```

### 目標配分への合わせ込み・分散最小化（凸 QP — 同梱 HiGHS）

同梱の HiGHS は連続変数（`m.continuous()`）からなる凸二次目的関数を求解できます：

```text
@ohtaman/washi（同梱 HiGHS）を使って、予算比率（合計 1.0）を 5 つのリージョン別計算プールへ配分し、各配分比率を m.continuous() 変数（lb: 0.05, ub: 0.50）で表してください。
目標比率は [0.30, 0.25, 0.20, 0.15, 0.10] とし、リージョン 0 と 1 の合計は 0.48 以下という上限を設けます。
sum(w) == 1.0 とリージョン 0・1 の合計上限のもとで二乗誤差和 expr`sum((${w} - ${target})^2)` を最小化し、m.verify().valid === true を確認してください。
```

### ルール・設定の矛盾診断（実行不能判定 / Unsat Core）

```text
@ohtaman/washi と @ohtaman/washi/solvers/pumpkin を使って、有界整数変数と真偽値変数からなるデプロイ・機能フラグ設定ルール群が充足可能かどうかを await m.check({ solver: "pumpkin" }) で検査してください。
意図的に矛盾する名前付きルールを含むテストケースを用意し、res.status と res.unsatCore（または res.conflicts）を出力して、どのルール同士が衝突しているかを表示してください。
```

> [!NOTE]
> `await m.check()` は標準の **HiGHS** でも動作し、競合する制約名を `res.conflicts` に返します。
>
> 厳密な充足不能コア（`res.unsatCore`）を抽出したい場合は、変数の種類でソルバーを選びます：
> - **有界整数・真偽値モデル**: 同梱の `@ohtaman/washi/solvers/pumpkin` をインポートします（ブラウザの `COOP`/`COEP` ヘッダー不要）。
> - **連続変数・小数（非整数）係数を含むモデル**: `z3-solver` を追加し、`@ohtaman/washi/solvers/z3` をインポートします。

---

## 4. アプリ化・配布用プロンプト（単一 HTML・デスクトップ・モバイル）

CLI スクリプトでの定式化と検証が完了したら、同じモデルを単一 HTML ツールやオフラインアプリへ展開できます。

### サーバー不要の単一 `.html` ツール（ローカル `.html` のダブルクリック起動 / `file://`）

```text
この @ohtaman/washi の最適化モデルを、HTML・CSS・JavaScript を 1 ファイルにまとめたスタンドアロンの .html ツールにして、チームメンバーがローカルの .html ファイルをダブルクリックする（file://）だけで開けるようにしてください。
- WaSHI は https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js（グローバル変数 window.Washi）から読み込むこと。
- CSV / テキスト入力欄、「最適化を実行」ボタン、結果テーブル、およびステータスが "Infeasible" の場合に await m.check() で競合ルールを特定して表示する診断欄を用意すること。
- 解が得られた場合は必ず m.verify() で検証すること。
```

**`file://` 実行時の動作仕様**:

| シナリオ | 動作と前提条件 |
| --- | --- |
| **CDN スクリプト** | HTTPS CDN から読み込む `washi.min.js` は `file://` でもサーバー不要で動作します。`file://` のような不透明オリジン（`window.origin === "null"`）では HiGHS と Pumpkin が自動的にメインスレッドで実行されます。 |
| **セルフホスト `.wasm`** | `file://` ではブラウザがローカル `.wasm` への `fetch()` をブロックします。セルフホスト時は `http://` または `https://` で配信してください。 |
| **ブラウザでの Z3** | セキュアコンテキスト（`https://` または `http://localhost`、通常の `http://` LAN URL は不可）と `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`（`COOP`/`COEP`）が必要です。詳細は [Cross-Origin Isolation 設定](./cross-origin.md) を参照してください。 |

### オフラインのデスクトップ・モバイルアプリ（Vite + Tauri / Capacitor / PWA）

```text
この Vite + TypeScript の @ohtaman/washi アプリを、バックエンドサーバーや外部ソルバーのインストールを使わずオフラインで動作するデスクトップ / モバイルアプリとして構成してください（同梱の HiGHS または @ohtaman/washi/solvers/pumpkin を使用）。
- ソルバー実行はすべて @ohtaman/washi によるクライアント内完結とすること。
- Content Security Policy で WebAssembly のコンパイル（script-src に 'wasm-unsafe-eval'）および Web Worker（worker-src 'self' blob:）を許可すること。
```

**WebView 環境での動作仕様**:

標準の Vite ビルド成果物は、使用するソルバーの `.wasm`（`highs.wasm` やインポート時の `pumpkin.wasm`）を静的アセットとして同梱します。Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor のモバイル WebView、Service Worker 対応 PWA でオフライン動作します。Content Security Policy（`CSP`）では、`script-src` に `'wasm-unsafe-eval'`（Web Worker 利用時は `worker-src 'self' blob:`）を指定してください。`tauri.conf.json` の設定例は [ランタイム環境とデプロイ構成](./runtimes.md) にまとめています。

---

## 5. エージェントとの反復改善とデバッグ

### すべての制約に命名し `m.verify()` を徹底する

`m.constraint(c, "rule_name")` と `m.indicator(...)` に分かりやすい名前を付け、求解後に必ず `m.verify().valid === true` であることを確認するよう指示してください。名前を省略すると 1 始まりの自動名（線形制約は `c_1`, `c_2`、論理制約は `lc_1`, `lc_2`）になり、競合診断結果が読みにくくなります。

### `"Infeasible"` 発生時は `m.check()` で原因を特定する

条件の追加によって `m.solve()` が `"Infeasible"` を返した場合は、次のような追加プロンプトが有効です：

```text
新しい条件を追加したところ m.solve() が "Infeasible" になりました。
await m.check()（有界整数・真偽値モデルなら await m.check({ solver: "pumpkin" })）を実行して res.conflicts / res.unsatCore を出力し、どの名前付きルールや変数の上下限が矛盾しているかを説明した上で、どの条件を非負スラック変数と目的関数のペナルティ項を用いたソフト制約へ緩和すべきか提案してください。
```

### 本番利用前に `m.toLpString()` と変数上下限を確認する

小規模なテストデータで `m.toLpString()` を出力させ、次の 3 点を確認します：

- **有限の上下限（`lb` / `ub`）**: `M` を省略した `m.indicator()` の対象制約に含まれる変数には有限の上下限が必須です。
- **目的関数の向き**: `Maximize` / `Minimize` の別が業務目的に一致しているか確認します。
- **制約の等号・不等号**: すべての `<=`・`>=`・`=` の種別と向きが意図通りか点検します。
