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
      <div class="code-title">ブラウザ標準 ESM (バージョンを固定して利用)</div>
      <pre><code>&lt;script type="module"&gt;
  // dist/browser 一式を社内 HTTP サーバーまたは CDN から配信します
  import { Model, INTEGER, sum } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.1.2/dist/browser/washi.js";

  const m = new Model({ name: "Production", sense: "Maximize" });
  const x = m.addVar({ name: "x", type: INTEGER, lb: 0 });
  const y = m.addVar({ name: "y", type: INTEGER, lb: 0 });

  m.maximize(x.mul(30).add(y.mul(50)));
  m.addConstraint(x.add(y.mul(2)).le(40), "c1");
  m.addConstraint(x.mul(2).add(y).le(50), "c2");

  const status = await m.optimize({ useWorker: false });
  console.log("最適目的関数値:", m.objectiveValue); // 1100
  console.log("x:", x.value, "y:", y.value);     // 20, 10
&lt;/script&gt;</code></pre>
    </div>
  </div>

  <div class="docs-section">
    <h3>配布とオフライン利用</h3>
    <p>npm から Vite / webpack に組み込むと、同梱 WASM と Worker が配布アセットとして出力されます。外部 CDN への自動切り替えはありません。ブラウザ直接利用は dist/browser 一式を HTTP 配信してください。必要なファイルがローカルにあれば、外部ネットワークなしで計算できます。</p>
    <p>CodePen の External Scripts には dist/browser/washi.min.js の URL（例: 0.1.2 固定）を追加し、Washi.Model を使います。簡単なデモは solve({ useWorker: false }) で実行できます。CDN Worker を使う場合は CORS と CSP の対応が必要です。</p>
  </div>

  <div class="docs-section">
    <h3>構文対照表: Python PuLP との比較</h3>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>機能項目</th>
          <th>Python PuLP</th>
          <th>HiGHS Web Modeler</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>インポート</strong></td>
          <td><code>import pulp</code></td>
          <td><code>import { LpProblem, LpVariable, lpSum, LpMaximize, value } from "highs-web"</code></td>
        </tr>
        <tr>
          <td><strong>問題定義</strong></td>
          <td><code>prob = pulp.LpProblem("Name", pulp.LpMaximize)</code></td>
          <td><code>const prob = new LpProblem("Name", LpMaximize);</code></td>
        </tr>
        <tr>
          <td><strong>変数の定義</strong></td>
          <td><code>x = pulp.LpVariable("x", 0, None, pulp.LpInteger)</code></td>
          <td><code>const x = new LpVariable("x", 0, undefined, LpInteger);</code></td>
        </tr>
        <tr>
          <td><strong>多次元・辞書変数</strong></td>
          <td><code>x = pulp.LpVariable.dicts("x", items, 0, 1, pulp.LpBinary)</code></td>
          <td><code>const x = LpVariable.dicts("x", items, 0, 1, LpBinary);</code></td>
        </tr>
        <tr>
          <td><strong>目的関数の設定</strong></td>
          <td><code>prob += 30*x + 50*y, "Profit"</code></td>
          <td><code>prob.setObjective(x.mul(30).add(y.mul(50)));</code><br/>または <code>prob.setObjective("30 * x + 50 * y");</code></td>
        </tr>
        <tr>
          <td><strong>制約条件の追加</strong></td>
          <td><code>prob += x + 2*y &lt;= 40, "Carpentry"</code></td>
          <td><code>prob.addConstraint(x.add(y.mul(2)).le(40), "Carpentry");</code><br/>または <code>prob.addConstraint("x + 2*y &lt;= 40");</code></td>
        </tr>
        <tr>
          <td><strong>総和計算 (lpSum)</strong></td>
          <td><code>pulp.lpSum([x[i] * cost[i] for i in items])</code></td>
          <td><code>lpSum(items, i =&gt; x[i].mul(cost[i]))</code></td>
        </tr>
        <tr>
          <td><strong>最適化の実行</strong></td>
          <td><code>prob.solve()</code></td>
          <td><code>await prob.solve();</code></td>
        </tr>
        <tr>
          <td><strong>最適解の値取得</strong></td>
          <td><code>pulp.value(x), pulp.value(prob.objective)</code></td>
          <td><code>value(x), value(prob.objective)</code> または <code>x.value</code></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="docs-section">
    <h3>構文対照表: python-mip との比較</h3>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>機能項目</th>
          <th>python-mip</th>
          <th>HiGHS Web Modeler</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>インポート</strong></td>
          <td><code>from mip import Model, xsum, maximize, INTEGER</code></td>
          <td><code>import { MipModel, xsum, maximize, INTEGER } from "highs-web"</code></td>
        </tr>
        <tr>
          <td><strong>モデル作成</strong></td>
          <td><code>m = Model(sense=MAXIMIZE)</code></td>
          <td><code>const m = new MipModel("ModelName", MAXIMIZE);</code></td>
        </tr>
        <tr>
          <td><strong>変数追加</strong></td>
          <td><code>x = m.add_var(name="x", var_type=INTEGER, lb=0)</code></td>
          <td><code>const x = m.add_var({ name: "x", var_type: INTEGER, lb: 0 });</code></td>
        </tr>
        <tr>
          <td><strong>目的関数指定</strong></td>
          <td><code>m.objective = maximize(30*x + 50*y)</code></td>
          <td><code>m.objective_spec = maximize(x.mul(30).add(y.mul(50)));</code></td>
        </tr>
        <tr>
          <td><strong>制約追加</strong></td>
          <td><code>m += x + 2*y &lt;= 40</code></td>
          <td><code>m.add_constr(x.add(y.mul(2)).le(40));</code></td>
        </tr>
        <tr>
          <td><strong>最適化実行</strong></td>
          <td><code>m.optimize()</code></td>
          <td><code>await m.optimize();</code></td>
        </tr>
        <tr>
          <td><strong>変数解の参照</strong></td>
          <td><code>x.x</code></td>
          <td><code>x.x</code> (または <code>x.value</code>)</td>
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
      <li><strong>双対変数（シャドウプライス）と被約費用</strong>: <code>constraint.dual</code>（または <code>constraint.pi</code>）および <code>var.reducedCost</code> により、経済的評価や感度分析が可能です。</li>
      <li><strong>多次元変数マトリクス</strong>: <code>m.addVars2D(rows, cols, { type: BINARY })</code> により、配属問題や輸送問題の多次元変数を直感的に一括生成できます。</li>
      <li><strong>PuLP / python-mip 流のソルバー切り替え（非依存性）</strong>: HiGHS への密結合ではなく、<code>prob.solve(new HiGHS())</code>、<code>MockSolver</code>、あるいは任意の独自ソルバーエンジン（自社バックエンド API 等）を共通インターフェースで自由に差し替えられます。</li>
    </ul>
  </div>

  <div class="docs-section">
    <h3>ソルバー切り替え機能 (Solver Independence)</h3>
    <p>
      Python の <strong>PuLP</strong> と同様に、モデルの定式化とソルバーエンジンの実行が完全に分離されています。
    </p>
    <div class="code-card">
      <div class="code-title">ソルバーの切り替え利用例</div>
      <pre><code>import { Model, LpProblem, HiGHS, MockSolver } from "highs-web";

// 1. デフォルトソルバー (HiGHS WebAssembly) で解く
await prob.solve();

// 2. オプションを指定した明示的な HiGHS インスタンスで解く
await prob.solve(new HiGHS({ timeLimit: 30, mipGap: 0.01 }));

// 3. テスト・CI 用 Mock ソルバー（WASM を読み込まず即座に擬似解を返却）
await prob.solve(new MockSolver({
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
await prob.solve(myBackendSolver);
</code></pre>
    </div>
  </div>
</div>
`;
