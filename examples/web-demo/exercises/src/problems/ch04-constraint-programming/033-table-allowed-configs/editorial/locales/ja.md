## アプローチ

部品数を $k$（`componentCosts.length`）、各部品のオプションコスト配列を $\text{cost}_c$（`componentCosts[c]`）、互換ルール集合を $\mathcal{R}_{\text{allowed}}$（`allowedRules`）、禁止ルール集合を $\mathcal{R}_{\text{forbidden}}$（`forbiddenRules`）とおきます。各部品に選択オプションを表す有限整数変数 $x_c \in \{0, \dots, |\text{cost}_c| - 1\}$（`choices[c]`）を導入し、各ルールの対象部品タプルが許容集合 $T^+$ に含まれること・禁止集合 $T^-$ に含まれないことを制約して、総コスト $\sum_{c=0}^{k-1} \text{cost}_{c,\, x_c}$ を最小化します。WaSHI（Pumpkin）では、`allowed(vars, tuples)`、`not(allowed(vars, tuples))`、および `at(componentCosts[c], choices[c])` でそのまま記述できます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{c=0}^{k-1} \text{cost}_{c,\, x_c} \\
\text{s.t.} \quad & (x_{v_1}, \dots, x_{v_r}) \in T^+ && \forall ((v_1, \dots, v_r), T^+) \in \mathcal{R}_{\text{allowed}} \\
& (x_{v_1}, \dots, x_{v_r}) \notin T^- && \forall ((v_1, \dots, v_r), T^-) \in \mathcal{R}_{\text{forbidden}} \\
& x_c \in \{0, \dots, |\text{cost}_c| - 1\} && \forall c \in \{0, \dots, k - 1\}
\end{aligned}
$$

## ポイント

- **外延的テーブル制約の表現力**: 2 変数・3 変数間の離散的な互換表を MIP で線形化すると多数の選択バイナリ変数が必要になりますが、CP では `allowed()` と `not(allowed())` が Pumpkin ネイティブの `table` / `negative_table` プロパゲータへ直接変換されます。
- **`not(allowed(...))` による疎な禁止表現**: 禁止組合せだけを `not(allowed(...))` に渡すことで、補集合のタプルをすべて列挙する手間とサイズ増大を避けられます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

`allowedRules` には `allowed(...)`、`forbiddenRules` には `not(allowed(...))` を `m.constraint([...])` で一括登録し、`at(costs, choices[c])` の総和を最小化して Pumpkin で解きます。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.allowedRules.map((r) => allowed(r.vars.map((c) => choices[c]), r.tuples))
);
m.constraint(
  input.forbiddenRules.map((r) => not(allowed(r.vars.map((c) => choices[c]), r.tuples)))
);
m.objective(minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c])))));
await m.solve({ solver: "pumpkin" });
```
