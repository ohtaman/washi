## アプローチ

入力の `a` と `b` を足して `{ sum }` をそのまま `return` します（ソルバーは使いません）。

## 数式

$$
\text{sum} = a + b
$$

## ポイント

- 各問題ではエディタ内の関数がテストケースごとに呼び出され、`console.log` や `print` ではなく**戻り値**（JSON オブジェクト / Python `dict`）が採点されます。
- 初期コードのまま実行すると 0 が返って **VIOLATION** になりますが、`a + b` を返すように直すと **AC** になります。
- **#001** に進む前に、決定変数・制約・判定の意味を確認したい場合は [ガイド・用語集](?view=guide&lang=ja#solve-contract) を参照してください。

## 実装の勘所

入力として受け取った 2 つの数値 `a` と `b` を足し合わせ、出力仕様の `sum` フィールドに格納して返します。

**WaSHI (TypeScript)**

```ts
return { sum: input.a + input.b };
```

**PuLP (Python)**

```python
return {"sum": a + b}
```
