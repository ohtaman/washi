## アプローチ

$k$ 個の部品（$c \in \{0, \dots, k - 1\}$）それぞれについて選択を表す有界整数変数 $x_c = \text{choices}[c]$ を用意し、許容ルールを `allowed(vars, tuples)`、禁止ルールを `not(allowed(vars, tuples))` でそのまま記述したうえで、`at(componentCosts[c], choices[c])` の合計コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{c=0}^{k-1} \text{cost}_{c,\, x_c} \\
\text{s.t.} \quad & (x_{v_1}, \dots, x_{v_r}) \in T^+ && \forall (V, T^+) \in \mathcal{R}_{\text{allowed}}, \; V = (v_1, \dots, v_r) \\
& (x_{v_1}, \dots, x_{v_r}) \notin T^- && \forall (V, T^-) \in \mathcal{R}_{\text{forbidden}}, \; V = (v_1, \dots, v_r) \\
& x_c \in \{0, \dots, |\text{cost}_c| - 1\} && \forall c \in \{0, \dots, k - 1\}
\end{aligned}
$$

## ポイント

- **外延的テーブル制約の表現力**: 2 変数・3 変数間の離散的な互換表を MIP で線形化すると多数の選択バイナリ変数が必要になりますが、CP では `allowed()` と `not(allowed())` が Pumpkin ネイティブの `table` / `negative_table` プロパゲータへ直接変換されます。
- **`not(allowed(...))` による疎な禁止表現**: 禁止組み合わせだけを `not(allowed(...))` に渡すことで、補集合のタプルをすべて列挙する手間とサイズ増大を避けられます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

各部品の選択肢数に合わせた有界整数変数 `choices[c]` を宣言し、`allowedRules` には `allowed(...)`、`forbiddenRules` には `not(allowed(...))` を `m.constraint([...])` で一括登録したうえで、`at(costs, choices[c])` の総和を最小化して Pumpkin で解きます。

**WaSHI (TypeScript)**

```ts
const choices = input.componentCosts.map((costs, c) =>
  m.integer(`comp_${c}`, { lb: 0, ub: costs.length - 1 })
);
m.constraint(
  input.allowedRules.map((r) => allowed(r.vars.map((c) => choices[c]), r.tuples))
);
m.constraint(
  input.forbiddenRules.map((r) => not(allowed(r.vars.map((c) => choices[c]), r.tuples)))
);
m.objective(minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c])))));
await m.solve({ solver: "pumpkin" });
```
