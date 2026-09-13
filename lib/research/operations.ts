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

import { getClaim } from "./projections"
import { isTensionStillRaised, parseTensionId } from "./tensions"
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

/**
 * 一次被拒绝的处置，带着**稳定**的 code。
 *
 * code 是稳定的，所以界面可以按它决定显示什么（以及是否提供「接受为局限」
 * 这条替代路径），而不是去匹配文案。
 */
export interface DispositionIssue {
  code: string
  message: string
}

/**
 * 处置的结果。
 *
 * 成功时把 `disposition` 一起返回，是因为调用方几乎总是要用它
 * （例如把新接受的那条局限立刻显示出来），而让它再从 `data` 里捞一次
 * 就等于开了第二个「哪条是刚写的」的推断路径。
 */
export type DispositionOutcome =
  | { ok: true; data: ResearchData; disposition: TensionDisposition }
  | { ok: false; issues: DispositionIssue[] }

/** 人与 AI 输出的交互结果。与 `DispositionOutcome` 同构，理由相同。 */
export type AiOutputOutcome =
  | { ok: true; data: ResearchData }
  | { ok: false; issues: DispositionIssue[] }

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
 * 对一条张力做出处置。**带守卫，且守卫不可绕过。**
 *
 * ## 处置不会让张力消失
 *
 * `deriveTensions` 之后仍然会算出同一条张力。这是刻意的——「我知道这个洞，
 * 我决定接受它」和「这个洞不存在」是两句话，把它们合并就是在对自己撒谎。
 *
 * 重复处置同一条张力时保留全部历史记录（`dispositions` 是追加的），
 * 投影取最后一次。
 *
 * ## 四条守卫，全部在**这一个**入口上（不变量 13）
 *
 * ```
 * disposition/unknown-tension
 *     这条张力指向的论断根本不存在（id 打错了）。必须拒绝：否则历史里会留下
 *     一条谁也对不上的处置记录。这一条**必须**与下一条分开——
 *     `isTensionStillRaised` 对「洞被填上了」和「id 不存在」都返回 false，
 *     而两者的正确处置完全相反。
 *
 * disposition/resolved-requires-fact-change
 *     resolved 是一句**事实断言**：「这个洞不存在了」。所以它只在事实真的变了
 *     的时候成立——`isTensionStillRaised()` 仍为 true 时拒绝。
 *
 * disposition/accepted-without-raised-tension
 *     accepted-as-limitation 是一句**判断**：「洞还在，我带着它交付」。
 *     洞不在就不能这么接受——那会凭空造出一条局限，并在交付物里写上一句
 *     关于一个不存在的问题的话。
 *
 * disposition/missing-reason
 *     理由不能为空。它不是装饰：这是这条记录半年后还能被理解的唯一依据，
 *     而 accepted-as-limitation 的理由还会直接成为交付物里的边界声明。
 * ```
 *
 * ## 为什么返回结果对象而不是抛异常
 *
 * 被拒绝**不是异常情况**：界面会**经常**遇到「洞还在，所以不能标记为已解决」，
 * 并且需要把这个理由**显示给用户**（而不是弹一个红框然后什么都不说）。
 * 所以拒绝必须是一条可以正常处理的数据，带着稳定的 `code`。
 *
 * 失败时**不写任何状态**，也**不写轨迹**：一条没有发生的事不该出现在
 * append-only 的业务日志里。`attempt invalid resolve` 因此不产生 TraceEntry——
 * 这是刻意的，不是遗漏。
 */
export function dispositionTension(
  data: ResearchData,
  tensionId: string,
  resolution: TensionResolution,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): DispositionOutcome {
  const issues: DispositionIssue[] = []

  const parsed = parseTensionId(tensionId)
  if (!parsed || !getClaim(data, parsed.claimId)) {
    issues.push({
      code: "disposition/unknown-tension",
      message: `这条张力指向的论断不存在：${tensionId}。处置必须先能追溯到一条真实论断。`,
    })
    return { ok: false, issues }
  }

  const stillRaised = isTensionStillRaised(data, tensionId)

  if (resolution === "resolved" && stillRaised) {
    issues.push({
      code: "disposition/resolved-requires-fact-change",
      message:
        "事实没有改变，不能标记为已解决。「解决」是一句事实断言——先补上材料让这条张力不再被推导出来，" +
        "或者把它接受为已知局限（那才是诚实的说法）。",
    })
  }

  if (resolution === "accepted-as-limitation" && !stillRaised) {
    issues.push({
      code: "disposition/accepted-without-raised-tension",
      message: `这个洞已经不存在了，没有需要接受的局限：${tensionId}。`,
    })
  }

  if (meta.reason.trim().length === 0) {
    issues.push({
      code: "disposition/missing-reason",
      message:
        "处置必须说明理由。理由不是装饰——它是这条记录在半年后还能被理解的唯一依据。",
    })
  }

  if (issues.length > 0) return { ok: false, issues }

  const disposition: TensionDisposition = {
    tensionId,
    researchId: data.research.id,
    resolution,
    reason: meta.reason,
    actor: meta.actor,
    at: meta.at,
  }

  const next: ResearchData = { ...data, dispositions: [...data.dispositions, disposition] }
  return {
    ok: true,
    disposition,
    data: appendTrace(next, {
      at: meta.at,
      actor: meta.actor,
      kind: "tension-dispositioned",
      subject: { type: "tension", id: tensionId },
      reason: `${resolution}：${meta.reason}`,
    }),
  }
}

/**
 * 人与 AI 输出的两种交互入口。
 *
 * ## 两者都不改业务事实（这是一条硬约束，不是约定）
 *
 * 无论驳回还是采纳，下面两个函数**都不会**：
 *
 * ```
 * 修改 Claim.text
 * 修改 EvidenceLink.stance
 * 处置任何 Tension
 * 修改任何 Finding
 * ```
 *
 * 它们只往轨迹里追加一条记录。AI 的位置是「指出问题」，最终判断由人做——
 * 而这个区分是靠**API 形状**保证的：这里根本没有可以改那些字段的参数。
 * 一条测试断言这两个函数返回的 data 里除了 `trace` 之外**逐字段全等**。
 */
export function rejectAiOutput(
  data: ResearchData,
  outputId: string,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): AiOutputOutcome {
  return recordAiOutputDecision(data, outputId, "ai-output-rejected", meta)
}

/**
 * 采纳一条 AI 输出。
 *
 * **采纳不是一个结束状态。** 它记的是「人看过这条批评，认为它成立、值得处理」。
 * 它不处置张力、不补材料、不改变任何事实。被采纳的批评**仍然留在**
 * 审稿意见里（只是标记为「已接受为待处理」），直到人真的去补材料、
 * 或者明确把它接受为一个局限。
 *
 * 把采纳当成「处理完了」是这一整个阶段最容易被做错的语义——
 * 所以它与 `TensionResolution` 的两种出口是**三件不同的事**，三个不同的
 * 事件类型，在界面上也有三种不同的样子。
 */
export function acceptAiOutput(
  data: ResearchData,
  outputId: string,
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): AiOutputOutcome {
  return recordAiOutputDecision(data, outputId, "ai-output-accepted", meta)
}

function recordAiOutputDecision(
  data: ResearchData,
  outputId: string,
  kind: "ai-output-rejected" | "ai-output-accepted",
  meta: { actor: Actor; at: IsoTimestamp; reason: string },
): AiOutputOutcome {
  const issues: DispositionIssue[] = []

  const output = data.aiOutputs.find((candidate) => candidate.id === outputId)
  if (!output) {
    issues.push({
      code: "ai/unknown-output",
      message: `这条 AI 输出不存在：${outputId}。`,
    })
    return { ok: false, issues }
  }

  if (meta.reason.trim().length === 0) {
    issues.push({ code: "ai/missing-reason", message: "处理 AI 输出必须留下理由。" })
  }

  /* 一条输出只能有一个终态。允许「先驳回再采纳」会让历史里留下两条互相
     否认的记录，而界面读的是「最后一次」——那等于让后一次覆盖前一次，
     而前一次仍然在轨迹里可见。宁可拒绝第二次，让用户去改事实。 */
  const decisions = data.trace.map((entry) => ({ id: entry.subject.id, kind: entry.kind }))
  const alreadyRejected = decisions.some(
    (entry) => entry.id === outputId && entry.kind === "ai-output-rejected",
  )
  const alreadyAccepted = decisions.some(
    (entry) => entry.id === outputId && entry.kind === "ai-output-accepted",
  )

  if (kind === "ai-output-accepted" && alreadyRejected) {
    issues.push({
      code: "ai/already-rejected",
      message: "这条输出已经被驳回了。要改变主意，请说明为什么——而不是让两条记录互相否认。",
    })
  }
  if (kind === "ai-output-rejected" && alreadyAccepted) {
    issues.push({
      code: "ai/already-accepted",
      message: "这条输出已经被采纳了。要改变主意，请说明为什么——而不是让两条记录互相否认。",
    })
  }
  if (kind === "ai-output-accepted" && alreadyAccepted) {
    issues.push({ code: "ai/already-accepted", message: "这条输出已经采纳过了。" })
  }
  if (kind === "ai-output-rejected" && alreadyRejected) {
    issues.push({ code: "ai/already-rejected", message: "这条输出已经驳回过了。" })
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    data: appendTrace(data, {
      at: meta.at,
      actor: meta.actor,
      kind,
      subject: { type: "ai-output", id: outputId },
      reason: meta.reason,
    }),
  }
}

/** 新增一条 Finding。交付物，所以也留一条创建记录。 */
export function addFinding(data: ResearchData, finding: Finding): ResearchData {
  return { ...data, findings: [...data.findings, finding] }
}
