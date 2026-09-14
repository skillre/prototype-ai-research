/**
 * 界面组装层 —— 领域真相 → 可渲染结构。
 *
 * 这一层不依赖 React（纯函数），也不含任何业务规则：它调 `lib/research`、
 * 按需求组装、然后交给 `components/research/`。
 *
 * 它**不是**领域层的第二份实现：这里没有任何一个数值是自己算出来的。
 * `reviewer` 里也没有第二套事实模型——审稿意见指向的都是领域层已有的
 * Tension 与 AiOutput；`trace` 里同样没有第二套历史——它只把
 * `TraceEntry` 的 subject id 解析成人话。
 */
export * from "./projections"
export * from "./reviewer"
export * from "./trace"
