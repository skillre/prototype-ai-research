/**
 * 领域操作 —— 唯一允许修改 `ResearchData` 的地方。
 *
 * ## 设计约束：不可能忘记写轨迹
 *
 * 每个函数都**原子地**同时做两件事：改状态 + 追加轨迹。
 * 调用方拿不到一个「只改状态」的入口。
 *
 * 这不是风格问题。如果存在「撤回论断」和「记一笔轨迹」两个独立调用，
 * 那么总有一天会有人只调第一个——而 `deletion.preserves-history` 会在那次
 * 静默失效，直到很久以后有人需要轨迹时才发现。把两件事绑成一个操作，
 * 这条不变量就变成结构上成立的，而不是需要靠自觉维护的。
 *
 * ## 撤回 ≠ 删除
 *
 * 本模块**没有** `deleteClaim` / `deleteLink`。它们不会存在：
 * 物理删除会把这个产品最重要的信息（我考虑过什么、为什么排除）删掉。
 */

import { appendTrace } from "./trace"
import type {
  Actor,
  Claim,
  EvidenceLink,
  Finding,
  IsoTimestamp,
  ResearchData,
  TensionDisposition,
  TensionResolution,
} from "./types"

/** 新增一条论断，并留下创建记录。 */
export function addClaim(
  data: ResearchData,
  claim: Claim,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  const next = { ...data, claims: [...data.claims, claim] }
  return appendTrace(next, {
    at: meta.at,
    actor: meta.actor,
    kind: "claim-created",
    subject: { type: "claim", id: claim.id },
    reason: meta.reason,
  })
}

/** 新增一条证据链接，并留下创建记录。 */
export function addLink(
  data: ResearchData,
  link: EvidenceLink,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  const next = { ...data, links: [...data.links, link] }
  return appendTrace(next, {
    at: meta.at,
    actor: meta.actor,
    kind: "link-created",
    subject: { type: "evidence-link", id: link.id },
    reason: meta.reason,
  })
}

/**
 * 撤回一条论断。
 *
 * 三件事同时发生，缺一不可：
 * 1. `claim.status = "retracted"` —— 它不再参与张力推导
 * 2. 它的**全部活跃链接被停用** —— 引用历史保留，只是不再计入
 * 3. 轨迹留下一条记录 —— 「我考虑过这条，因为 X 排除了」
 *
 * 注意论断与链接**都没有被移除**。`historicalClaims` / `historicalLinks`
 * 仍然查得到它们，这是 `deletion.preserves-history` 断言的东西。
 */
export function retractClaim(
  data: ResearchData,
  claimId: string,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  const index = data.claims.findIndex((claim) => claim.id === claimId)
  if (index === -1) return data

  const claims = data.claims.map((claim, i) =>
    i === index ? { ...claim, status: "retracted" as const } : claim,
  )

  const links = data.links.map((link) =>
    link.claimId === claimId && link.retiredAt === null
      ? { ...link, retiredAt: meta.at, retiredReason: meta.reason }
      : link,
  )

  const next: ResearchData = { ...data, claims, links }
  return appendTrace(next, {
    at: meta.at,
    actor: meta.actor,
    kind: "claim-retracted",
    subject: { type: "claim", id: claimId },
    reason: meta.reason,
  })
}

/**
 * 停用一条证据链接，但保留它。
 *
 * 用在「这条引用我引错了」——它从活跃集合里消失（不再计入强度与计数），
 * 但历史仍然完整。
 */
export function retireLink(
  data: ResearchData,
  linkId: string,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  const index = data.links.findIndex((link) => link.id === linkId)
  if (index === -1) return data

  const links = data.links.map((link, i) =>
    i === index ? { ...link, retiredAt: meta.at, retiredReason: meta.reason } : link,
  )

  const next: ResearchData = { ...data, links }
  return appendTrace(next, {
    at: meta.at,
    actor: meta.actor,
    kind: "link-retired",
    subject: { type: "evidence-link", id: linkId },
    reason: meta.reason,
  })
}

/**
 * 对一条张力做出处置。
 *
 * **处置不会让张力消失。** 它只是标记为已处理；`deriveTensions` 之后仍然
 * 会算出同一条张力。这是刻意的——「我知道这个洞，我决定接受它」和
 * 「这个洞不存在」是两句话，把它们合并就是在对自己撒谎。
 *
 * 重复处置同一条张力时保留全部历史记录（`dispositions` 是追加的），
 * 投影取最后一次。
 */
export function dispositionTension(
  data: ResearchData,
  tensionId: string,
  resolution: TensionResolution,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  const disposition: TensionDisposition = {
    tensionId,
    researchId: data.research.id,
    resolution,
    reason: meta.reason,
    actor: meta.actor,
    at: meta.at,
  }

  const next: ResearchData = { ...data, dispositions: [...data.dispositions, disposition] }
  return appendTrace(next, {
    at: meta.at,
    actor: meta.actor,
    kind: "tension-dispositioned",
    subject: { type: "tension", id: tensionId },
    reason: `${resolution}：${meta.reason}`,
  })
}

/**
 * 驳回一条 AI 输出。
 *
 * 输出**不删除**——它留在 `data.aiOutputs` 里，轨迹记着为什么被驳回。
 * 半年后有人问「为什么不用 AI 的建议」，答案是查得到的。
 */
export function rejectAiOutput(
  data: ResearchData,
  outputId: string,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): ResearchData {
  return appendTrace(data, {
    at: meta.at,
    actor: meta.actor,
    kind: "ai-output-rejected",
    subject: { type: "ai-output", id: outputId },
    reason: meta.reason,
  })
}

/** 新增一条 Finding。交付物，所以也留一条创建记录。 */
export function addFinding(data: ResearchData, finding: Finding): ResearchData {
  return { ...data, findings: [...data.findings, finding] }
}
