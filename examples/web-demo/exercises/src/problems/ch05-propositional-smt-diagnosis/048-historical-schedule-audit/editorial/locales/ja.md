## アプローチ

記録された実績割当 $\hat{v}$ に対して各名前付きルールを直接評価し、偽となるすべてのルール ID を収集します。WaSHI では真偽値変数 `m.bool`、有界整数変数 `m.integer`、およびルール ID を付けた制約 `m.constraint(..., r.id)` でモデルを構築し、探索を実行せずに `m.verify({ values: input.candidateValues })` を呼び出して、`report.violations` から違反ルール名を重複排除・辞書順ソートして返します。

## 数理モデル

$$
\begin{aligned}
\text{Violated} &= \bigl\{\, r.\text{id} \;\big|\; r \in R,\; \text{eval}\bigl(r.\text{expr},\, \hat{v}\bigr) = \text{false} \,\bigr\} \\
\text{valid} &\iff \text{Violated} = \emptyset
\end{aligned}
$$

## ポイント

- **ソルバー不要の決定的検証 (`m.verify`)**: `m.verify({ values })` は WebAssembly ソルバーを起動せず、モデル定義そのままの上下界・整数性・線形制約・論理式 AST（`and`, `or`, `not`, `implies`, `xor`）を TypeScript 上で高速に検証します。
- **名前付き制約による一括監査**: 各制約に `r.id` を渡すことで、`report.violations` の `.name` から違反ルール ID をそのまま取り出せます。
- 用語の確認: [ガイド・用語集 — 採点ステータス](?view=guide&lang=ja#verdicts)

## 実装の勘所

各コンプライアンスルールをルール ID `r.id` 付きで `m.constraint` に登録したうえで、`m.verify({ values: input.candidateValues })` を呼び出します。返却された `report.violations` から違反ルール ID を重複排除してソートします。

**WaSHI (TypeScript)**

```ts
for (const r of input.rules) {
  m.constraint(compileSmt(r.expr, bools, ints), r.id);
}
const report = m.verify({ values: input.candidateValues });
return {
  valid: report.valid,
  violatedRules: Array.from(new Set(report.violations.map((v) => v.name))).sort(),
};
```
