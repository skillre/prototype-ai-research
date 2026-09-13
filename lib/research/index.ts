/**
 * AI Research Workspace —— 领域层入口。
 *
 * 这一层不依赖 React、不依赖网络、不依赖时间。Phase A 的全部产物都在这里，
 * 它同时也是 Product UI（Phase D 起）唯一被允许读取业务真相的地方。
 *
 * ```
 * types.ts        实体与值类型。只有形状，没有行为。
 * projections.ts  所有派生值的唯一来源（活跃/历史投影、证据强度、依据状态）
 * tensions.ts     张力推导（派生事实）+ 处置合并
 * trace.ts        append-only 轨迹与查询
 * operations.ts   唯一允许修改数据的入口，且状态与轨迹原子同写
 * ai-reviewer.ts  AI 输出的数据契约与校验（无模型调用）
 * dataset.ts      确定性 mock 数据集
 * ```
 */

export * from "./types"
export * from "./projections"
export * from "./tensions"
export * from "./trace"
export * from "./operations"
export * from "./ai-reviewer"
export { loadBearingResearch, freshResearch, datasetSummary } from "./dataset"
