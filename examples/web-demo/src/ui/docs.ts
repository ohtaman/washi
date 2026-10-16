export const DOCS_HTML = `
<div class="docs-container">
  <h2>HiGHS Web Modeler: 導入手引と Python 移行ガイド</h2>
  <p class="lead">
    <strong>HiGHS Web Modeler</strong> は、Edinburgh 大学による世界最高峰の数理最適化ソルバー <strong>HiGHS (WebAssembly)</strong> を基盤に、Python の <strong>PuLP</strong> や <strong>python-mip</strong> で培われた直感的でエレガントなモデリング体験をブラウザおよび Node.js 環境に提供するライブラリです。
  </p>

  <div class="docs-section">
    <h3>パッケージの導入と利用環境</h3>
    <div class="code-card">
      <div class="code-title">npm / pnpm / bun (パッケージ公開後の導入例)</div>
      <pre><code>npm install @ohtaman/washi</code></pre>
    </div>
    <div class="code-card">
      <div class="code-title">ブラウザ標準 ESM (ビルド済み配布物の配信利用)</div>
      <pre><code>&lt;script type="module"&gt;
  // dist/browser 一式を自社 HTTP サーバー等から配信して読み込みます
  import { Model, expr, maximize } from "./dist/browser/washi.js";

  const m = new Model("Production");
  const x = m.integer("x", { lb: 0 });
  const y = m.integer("y", { lb: 0 });

  m.objective(maximize(expr\`30 * \${x} + 50 * \${y}\`));
  m.constraint(c\`\${x} + 2 * \${y} &lt;= 40\`, "c1");
  m.constraint(c\`2 * \${x} + \${y} &lt;= 50\`, "c2");

  const status = await m.solve({ useWorker: false });
  console.log("最適目的関数値:", m.objectiveValue); // 1100
  console.log("x:", x.value, "y:", y.value);     // 20, 10
&lt;/script&gt;</code></pre>
    </div>
  </div>

  <div class="docs-section">
    <h3>配布とオフライン利用</h3>
    <p>npm から Vite / webpack に組み込むと、同梱 WASM と Worker が配布アセットとして出力されます。外部 CDN への自動切り替えはありません。ブラウザ直接利用は dist/browser 一式を HTTP 配信してください。必要なファイルがローカルにあれば、外部ネットワークなしで計算できます。</p>
    <p>CodePen の External Scripts には dist/browser/washi.min.js の配信 URL を追加し、Washi.Model を使います。簡単なデモは solve({ useWorker: false }) で実行できます。CDN Worker を使う場合は CORS と CSP の対応が必要です。</p>
  </div>

  <div class="docs-section">
    <h3>Z3 ソルバーとブラウザ環境の要件（Cross-Origin Isolation）</h3>
    <p>
      Z3 SMT / MIP ソルバーはマルチスレッド WebAssembly（<code>SharedArrayBuffer</code>）で動作します。ブラウザのセキュリティ仕様により、以下のドキュメント配信ヘッダーが必須です：
    </p>
    <div class="code-card">
      <div class="code-title">必要な HTTP レスポンスヘッダー</div>
      <pre><code>Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp</code></pre>
    </div>
    <p>
      ヘッダーを独自設定できない静的ホスティング（GitHub Pages 等）や CodePen のプレビュー環境では、追加対応なしでは Z3 は動作しません。
      本公式 Web デモ（GitHub Pages）では、<code>/washi/</code> スコープ限定の独立した <code>coi-serviceworker.js</code> を同オリジンに配置・登録し、初回アクセス時に1回だけ安全に再読み込みを行うことで <code>crossOriginIsolated</code> 環境を成立させています。
      （※ライブラリ本体 <code>@ohtaman/washi</code> を import しただけで利用者のページに Service Worker を自動登録することはありません。）
    </p>
  </div>

  <div class="docs-section">
    <h3>WaSHI モダン代数モデリング API 早見表</h3>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>モデリング要素</th>
          <th>WaSHI API (TypeScript / JS)</th>
          <th>説明</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>モデル初期化</strong></td>
          <td><code>const m = new Model("Name");</code></td>
          <td>最適化モデルの生成。ソルバーは HiGHS (WASM) がデフォルト。</td>
        </tr>
        <tr>
          <td><strong>バイナリ変数</strong></td>
          <td><code>m.binary("x")</code> / <code>m.binary(items)</code></td>
          <td>0-1 決定変数。多次元・配列渡しもサポート。</td>
        </tr>
        <tr>
          <td><strong>整数変数</strong></td>
          <td><code>m.integer("x", { lb: 0, ub: 10 })</code></td>
          <td>上下限を指定可能な整数変数。</td>
        </tr>
        <tr>
          <td><strong>連続変数</strong></td>
          <td><code>m.continuous("x", { lb: 0 })</code></td>
          <td>線形・二次計画問題に対応する連続変数。</td>
        </tr>
        <tr>
          <td><strong>数式・制約の記述</strong></td>
          <td><code>expr\`...\`</code> / <code>c\`\${x} + 2 * \${y} &lt;= 40\`</code></td>
          <td>タグ付きテンプレートリテラルによる算術式（<code>expr</code>）と比較制約（<code>c</code>）。</td>
        </tr>
        <tr>
          <td><strong>制約の追加</strong></td>
          <td><code>m.constraint(c\`...\`, "name")</code></td>
          <td>宣言的な制約追加メソッド。配列渡しやチェーン記法にも対応。</td>
        </tr>
        <tr>
          <td><strong>目的関数の設定</strong></td>
          <td><code>m.objective(maximize(...))</code> / <code>m.objective(minimize(...))</code></td>
          <td>明示的なコンビネータ関数で目的関数とその方向を設定。</td>
        </tr>
        <tr>
          <td><strong>総和・内積集計</strong></td>
          <td><code>sum(items, i =&gt; x[i])</code> / <code>dot(costs, x)</code></td>
          <td>関数型および線形代数的なベクトル内積集計。</td>
        </tr>
        <tr>
          <td><strong>求解・最適化</strong></td>
          <td><code>await m.solve()</code></td>
          <td>WebAssembly ソルバーで求解を実行。</td>
        </tr>
        <tr>
          <td><strong>競合制約の特定</strong></td>
          <td><code>m.conflicts</code> / <code>res.conflicts</code></td>
          <td>実行不能（Unsat）時に矛盾原因となっている制約サブセットを取得。</td>
        </tr>
        <tr>
          <td><strong>解の値取得</strong></td>
          <td><code>x.value</code> / <code>m.getValues([x, y])</code></td>
          <td>変数の最適値、または配列・辞書形式での一括抽出。</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="docs-section">
    <h3>主要な技術特性</h3>
    <ul class="features-list">
      <li><strong>Web Worker による非同期分散実行</strong>: 大規模な混合整数線形計画問題（MIP）でも、計算を Web Worker スレッドで実行することで、ブラウザの UI 描画やユーザー操作を一切阻害しません。</li>
      <li><strong>タグ付きテンプレート DSL</strong>: <code>expr\`\${x} + 2 * \${y} &lt;= 40\`</code> のように、JavaScript の変数参照を直接式中に埋め込んで自然に制約を定義できます。</li>
      <li><strong>標準 CPLEX LP フォーマット完全準拠</strong>: <code>m.toLpString()</code> により、HiGHS や Gurobi、CPLEX、SCIP、GLPK でそのまま扱える標準 LP 構文のテキストを生成・検査できます。</li>
      <li><strong>双対変数（シャドウプライス）と被約費用</strong>: <code>constraint.dual</code> および <code>var.reducedCost</code> により、経済的評価や感度分析が可能です。</li>
      <li><strong>多次元変数マトリクス</strong>: <code>m.binary(rows, cols)</code> により、配属問題や輸送問題の多次元変数を直感的に一括生成できます。</li>
      <li><strong>ソルバー切り替え機能（非依存性）</strong>: HiGHS への密結合ではなく、<code>m.optimize(new HiGHS())</code>、<code>MockSolver</code>、あるいは任意の独自ソルバーエンジン（自社バックエンド API 等）を共通インターフェースで自由に差し替えられます。</li>
    </ul>
  </div>

  <div class="docs-section">
    <h3>ソルバー切り替え機能 (Solver Independence)</h3>
    <p>
      モデルの定式化とソルバーエンジンの実行が完全に分離されています。
    </p>
    <div class="code-card">
      <div class="code-title">ソルバーの切り替え利用例</div>
      <pre><code>import { Model, HiGHS, MockSolver } from "@ohtaman/washi";

// 1. デフォルトソルバー (HiGHS WebAssembly) で解く
await m.optimize();

// 2. オプションを指定した明示的な HiGHS インスタンスで解く
await m.optimize(new HiGHS({ timeLimit: 30, mipGap: 0.01 }));

// 3. テスト・CI 用 Mock ソルバー（WASM を読み込まず即座に擬似解を返却）
await m.optimize(new MockSolver({
  status: "Optimal",
  values: { x: 10, y: 20 },
  objectiveValue: 100
}));

// 4. 自社バックエンドサーバーや独自エンジンの注入 (Solver インターフェース)
const myBackendSolver = {
  name: "CompanyOptAPI",
  async solve(modelData, lpResult) {
    // 自社の最適化マイクロサービス (Gurobi / SCIP 等) へ LP 文字列を POST
    const res = await fetch("/api/v1/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lp: lpResult.lpString }),
    });
    const data = await res.json();
    return { status: data.status, objectiveValue: data.obj, values: data.solution };
  }
};
await m.optimize(myBackendSolver);
</code></pre>
    </div>
  </div>
</div>
`;
