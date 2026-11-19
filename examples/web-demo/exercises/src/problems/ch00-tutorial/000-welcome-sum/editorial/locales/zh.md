## 解题思路

无需构建优化模型，只需将输入的 `a` 和 `b` 相加后直接返回 `{ sum }`。

## 数学关系

$$
\text{sum} = a + b
$$

## 要点总结

- 判题器会对每个测试用例调用编辑器中的函数，并检查其**返回值**（对象 / 字典），而不是控制台日志。
- 初始代码默认返回 `0`，会得到 **VIOLATION**；改为返回 `a + b` 后即可获得 **AC**。
- 进入 **#001** 之前，可先在 [指南与术语表](?view=guide&lang=zh#solve-contract) 快速了解决策变量、约束与判题状态含义。

## 核心代码片段

**WaSHI (TypeScript)**

```ts
return { sum: input.a + input.b };
```

**Python (highspy)**

```python
return {"sum": input_data["a"] + input_data["b"]}
```
