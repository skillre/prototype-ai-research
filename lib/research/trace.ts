/**
 * 研究轨迹 —— append-only。
 *
 * ## 一条不可协商的规则
 *
 * **没有任何函数会从 `data.trace` 里删东西，也没有函数会改写已有条目。**
 * 本模块只导出「追加」和「查询」。
 *
 * 理由不是洁癖：轨迹回答的是「我考虑过 X 吗」「这条为什么被排除了」。
 * 一旦轨迹可以被改写，它对这两个问题的回答就不再可信——而这两个问题
 * 恰恰是评审会上最容易被追问、也最没有工具支持的地方。
 *
 * ## 它是事件，不是实体
 *
 * 见 `types.ts` 的 `TraceEntry` 说明。这里补一条实现层的推论：
 * **轨迹条目不能成为任何状态的唯一来源。** 它是发生了什么的历史，
 * 当前状态仍然在各自的实体上（`Claim.status`、`EvidenceLink.retiredAt`）。
 * 两条记录并存且必须一致——这就是为什么每个变更函数都**原子地**同时写两边。
 */

import type { Actor, Id, ResearchData, SubjectType, TraceEntry, TraceKind } from "./types"

/** 追加一条轨迹，返回新的聚合。唯一会修改 `trace` 的入口。 */
export function appendTrace(
  data: ResearchData,
  entry: { at: string; actor: Actor; kind: TraceKind; subject: { type: SubjectType; id: Id }; reason: string },
): ResearchData {
  // 确定性 id：序号来自当前长度。同样的操作序列必然得到同样的 id。
  // 不用随机数也不用时间戳——数据集与测试都必须可复现。
  const id = `trace-${String(data.trace.length + 1).padStart(4, "0")}`
  const record: TraceEntry = {
    id,
    at: entry.at,
    actor: entry.actor,
    kind: entry.kind,
    subject: entry.subject,
    reason: entry.reason,
  }
  return { ...data, trace: [...data.trace, record] }
}

/**
 * 某个对象的完整历史，按时间正序。
 *
 * 「这个论断被改过几次、为什么」只能靠它回答。注意它**会**包含当前状态
 * 已经看不到的东西——撤回的论断在这里仍然完整。
 */
export function traceForSubject(data: ResearchData, type: SubjectType, id: Id): TraceEntry[] {
  return data.trace
    .filter((entry) => entry.subject.type === type && entry.subject.id === id)
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** 全局时间线，最新的在前。 */
export function traceTimeline(data: ResearchData): TraceEntry[] {
  return [...data.trace].sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * 被驳回的 AI 输出 id。
 *
 * 驳回**不删除**输出——输出仍然在 `data.aiOutputs` 里，轨迹记着它被驳回了。
 * 这与「撤回论断不删除论断」是同一条原则：这个产品里没有静默消失的东西。
 */
export function rejectedAiOutputIds(data: ResearchData): Set<Id> {
  return new Set(
    data.trace.filter((entry) => entry.kind === "ai-output-rejected").map((entry) => entry.subject.id),
  )
}

/** 仍然有效的 AI 输出：那些没有被驳回的。 */
export function activeAiOutputs(data: ResearchData) {
  const rejected = rejectedAiOutputIds(data)
  return data.aiOutputs.filter((output) => !rejected.has(output.id))
}
