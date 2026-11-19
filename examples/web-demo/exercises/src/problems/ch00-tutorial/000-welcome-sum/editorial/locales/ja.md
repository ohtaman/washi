## アプローチ

ソルバーは使わず、入力の `a` と `b` を足して `{ sum }` をそのまま `return` します。

## 数式

$$
\text{sum} = a + b
$$

## ポイント

- 各問題ではエディタ内の関数がテストケースごとに呼び出され、`console.log` や `print` ではなく**戻り値**（JSON オブジェクト / Python `dict`）が採点されます。
- 初期コードのまま実行すると `0` が返って **VIOLATION** になりますが、`a + b` を返すように直すと **AC** になります。
- **#001** に進む前に、決定変数・制約・判定の意味を確認したい場合は [ガイド・用語集](?view=guide&lang=ja#solve-contract) を参照してください。

## 実装の勘所

**WaSHI (TypeScript)**

```ts
return { sum: input.a + input.b };
```

**Python (highspy)**

```python
return {"sum": input_data["a"] + input_data["b"]}
```
