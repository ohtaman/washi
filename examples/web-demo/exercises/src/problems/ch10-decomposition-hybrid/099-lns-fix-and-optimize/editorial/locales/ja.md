## アプローチ

実行可能な `initialPlan` から開始し、幅 `windowSize` の連続ウィンドウを 1 期ずつ重ねて走査します。各部分問題 `[start, start + windowSize)` ではウィンドウ内の段取り変数 `y_t` のみを 0-1 変数として解放し、ウィンドウ外の `y_t` は暫定解へ固定したまま全期間の連続生産量 `p_t` と在庫量 `inv_t` を自由に再配分して大域的なコスト削減を図ります。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \big(K_t y_t + c_t p_t + h I_t\big) \\
\text{s.t.} \quad & I_{t-1} + p_t - I_t = d_t && \forall t \quad (I_{-1} = 0) \\
& 0 \le p_t \le C_t y_t, \quad I_t \ge 0 && \forall t \\
& y_t \in \{0, 1\} && \forall t \in [s, s + W) \\
& y_t = \bar{y}_t && \forall t \notin [s, s + W)
\end{aligned}
$$

## ポイント

- **連続変数は全期間で自由に保つ**: ウィンドウ外の 0-1 段取りだけを固定し、連続変数 `p_t`, `inv_t` は全期間自由にしておくことで、あらゆる部分問題で実行可能性を維持しつつウィンドウ境界を跨いだ生産まとめが可能になります。
- **重なり幅 `windowSize - 1` の走査**: 開始位置を 1 ずつずらして走査すると、前方のウィンドウで不要になった段取りが後方の生産計画へ滑らかに伝播します。
- **固定変数の表現**: ウィンドウ外変数を `Binary` のまま上下限変更するのではなく整数範囲 `[v, v]` として定義することで、各ソルバで確実に固定値として扱われます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let pass = 0; pass < 10; pass++) {
  let improved = false;
  for (let start = 0; start <= T - win; start++) {
    const candidate = await solveWindow(input, best.setups, start, start + win);
    if (candidate && candidate.totalCost < best.totalCost - 1e-6) {
      best = candidate;
      improved = true;
    }
  }
  if (!improved) break;
}
```

**PuLP (Python)**

```python
for _ in range(10):
    improved = False
    for start in range(0, n_periods - win + 1):
        candidate = _solve_window(
            demands, setupCosts, prodCosts, holdCost, capacities, best["setups"], start, start + win
        )
        if candidate is not None and candidate["totalCost"] < best["totalCost"] - 1e-6:
            best = candidate
            improved = True
    if not improved:
        break
```
