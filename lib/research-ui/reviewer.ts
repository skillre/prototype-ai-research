/**
 * AI Reviewer 投影 —— 把领域层的 AI 输出契约变成「审稿意见」。
 *
 * ## 这个文件解决的核心问题：AI 不得拥有第二套事实
 *
 * AI 在本产品里的角色是 **Reviewer**（审稿人），不是 Assistant / Copilot / Chatbot。
 * 这意味着它**没有自己的结论**——它只能对已有的事实说话。
 *
 * 落到代码上是一条硬约束：
 *
 * ```
 * 审稿意见不新建任何事实对象。
 * 它要么引用一条已存的 AiOutput，
 * 要么引用一条领域层本来就能 derive 出来的 Tension。
 * ```
 *
 * 所以本文件里没有 `AiTension`。审稿意见上的 `tensionId` 指向的是
 * `deriveTensions()` 的产物——同一张嘴，不是第二张嘴。
 *
 * ## 两条来源，一个视图
 *
 * | provenance | 从哪来 | 特征 |
 * |---|---|---|
 * | `authored` | `data.aiOutputs`（确定性 mock，经 `constructAiOutput` 校验） | 有针对性、带 rationale |
 * | `derived`  | 领域层的 open tension + 一个读法检查 | 机械但完整，不会漏 |
 *
 * `authored` **优先**：同一条张力上如果有人（或 mock 数据）写了带 rationale 的批评，
 * 机械生成的那条就被压掉。这个方向的优先级是刻意的——它让精心写过的批评
 * 不会被一句模板盖过去。
 *
 * ## 三类输出的分开持有
 *
 * `AiDocument` 已经把它们分开装（见 types.ts 的说明），这里保持分开：
 * 它们在界面上的权重完全不同，混装之后区分只能靠渲染时记得判断 kind，
 * 而那种「记得」迟早会漏掉一处。
 */

import {
  type AiCritiqueOutput,
  type AiFactualOutput,
  type AiOutput,
  type ClaimBasisStatus,
  type Id,
  type Passage,
  type ResearchData,
  type SourceType,
  type Tension,
  type TensionKind,
  type TensionSeverity,
  acceptedAiOutputIds,
  activeAiOutputs,
  claimsUsingPassage,
  getPassage,
  openTensions,
  projectClaimVerification,
  projectTensions,
  rejectedAiOutputIds,
  buildAiDocument,
} from "@/lib/research"

/* -------------------------------------------------------------------------- */
/* 形状                                                                         */
/* -------------------------------------------------------------------------- */

export type ReviewerClass = "factual" | "critique" | "suggestion"

/**
 * 人对一条 AI 输出的处置状态。
 *
 * ⚠ **这三个状态与 `TensionResolution` 不是一回事，不要合并。**
 *
 * ```
 * acknowledged  人认为这条批评成立、值得处理   ← 还没处理完
 * rejected      人认为这条批评不成立           ← 它退出审稿意见
 * resolved      事实变了，洞没了
 * accepted-as-limitation  洞还在，我带着它交付
 * ```
 *
 * 「采纳」不是结束状态。把 `acknowledged` 显示成「已处理」，
 * 会让一条还没解决的批评看起来像解决了——那是本阶段最容易犯的错。
 */
export type ReviewerState = "pending" | "acknowledged" | "rejected"

export interface ReviewerNote {
  id: Id
  outputClass: ReviewerClass
  provenance: "authored" | "derived"
  state: ReviewerState
  /** 附着目标。`critique` 永远有（契约要求有靶心）；`suggestion` 永远没有（契约允许零引用）。 */
  claimId: Id | null
  /** 领域层已经 derive 出来的那条张力。`null` 表示这条意见说的不是张力。 */
  tensionId: Id | null
  tensionKind: TensionKind | null
  severity: TensionSeverity | null
  /** 一句话说明问题是什么。 */
  text: string
  /** AI 给的理由。只有 `authored` 的批评有。 */
  rationale?: string
  /** **具体事实**——来源名、引用数、依据状态。不是文案，所以由投影算。 */
  detail: string
  /** 建议的下一步。让「指出问题」不落成一个死胡同。 */
  nextStep: string
  /** Class 1 必带，其余为空数组。 */
  passageIds: Id[]
  passageLabels: string[]
  /** Class 1 的来源等级 —— 决定它在界面上的视觉等级。 */
  sourceType?: SourceType
}

export interface ReviewerBoard {
  /** Class 2 —— 审稿意见。**第一优先**。 */
  critiques: ReviewerNote[]
  /** Class 1 —— 事实抽取。逐条可回溯到原文。 */
  factuals: ReviewerNote[]
  /** Class 3 —— 建议。零引用、视觉弱化、永不进入交付物。 */
  suggestions: ReviewerNote[]
  /** 被驳回的输出。**没有被删除**——它进入了历史投影。 */
  rejected: ReviewerNote[]
  counts: {
    critiques: number
    factuals: number
    suggestions: number
    rejected: number
  }
}

/**
 * 词典注入。
 *
 * 投影是纯函数、不读词典，所以文案由调用方传进来——与
 * `projectArgumentChain` 的 `labels` 参数同一个理由。
 */
export interface ReviewerCopy {
  /** 由张力种类生成的批评：问题是什么。 */
  critiqueText: Record<TensionKind, string>
  /** 由张力种类生成的批评：下一步能做什么。 */
  critiqueNext: Record<TensionKind, string>
  /** 读法检查（不是张力）：把「没找到反例」当成「验证通过」。 */
  readingTrap: { text: string; next: string }
  /** 「已接受为待处理」——一条意见被采纳之后仍然留在板上的原因。 */
  acknowledgedSuffix: string
  /** 驳回之后留下的历史痕迹前缀。 */
  rejectedPrefix: string
}

/* -------------------------------------------------------------------------- */
/* 读法检查                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 审稿人不只是复述张力，他还会指出**读法上的错误**。
 *
 * 这一条检查的是本产品最容易被误读的一个投影：
 *
 * ```
 * projectClaimVerification(data, claimId)
 *   noContradictionFound: true   ← 弱陈述：「我没找到反驳」
 *   verified: false              ← 强陈述：「结论不成立」
 * ```
 *
 * 一条**根本没有证据**的论断同样满足 `noContradictionFound`——因为没人去找过。
 * 研究者很容易把前者当成后者的通行证。
 *
 * 这条检查只在「有支持、也确实没找到反驳、但仍然没有 verified」时触发——
 * 也就是说：**你没发现反例，但你没通过的原因在别处**（依据已失效，或没人确认过）。
 * 那是纯视觉的沉默，rails 与空槽都不会说它，所以它必须由审稿人说。
 *
 * ⚠ 它**不是一条张力**：这里没有任何事实需要被 derive 出来，
 * 所以它 `tensionId: null`。把它硬做成张力会让张力带失去可信度。
 */
function readingTrapFor(data: ResearchData, claimId: Id): ClaimBasisStatus | null {
  const verification = projectClaimVerification(data, claimId)
  if (!verification.hasSupport) return null
  if (!verification.noContradictionFound) return null
  if (verification.verified) return null
  return verification.basisStatus
}

/* -------------------------------------------------------------------------- */
/* 组装                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 把一次研究里的 AI 输出与领域投影组装成审稿意见板。
 *
 * 输出顺序是**确定性的**：先 blocking 的批评，再 notable 的，同组按附着论断的
 * 记录顺序。快照测试因此有意义。
 */
export function projectReviewerBoard(
  data: ResearchData,
  copy: ReviewerCopy,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): ReviewerBoard {
  /* 领域层的校验在这里被执行一次：不合契约的输出**根本不会进入**这个视图
     （`buildAiDocument` 只收下校验通过的）。所以 UI 不需要自己判断合法性。 */
  const document = buildAiDocument(data, activeAiOutputs(data))

  const rejectedIds = rejectedAiOutputIds(data)
  const acknowledgedIds = acceptedAiOutputIds(data)
  const rejectedOutputs = data.aiOutputs.filter((output) => rejectedIds.has(output.id))

  const stateOf = (id: Id): ReviewerState =>
    rejectedIds.has(id) ? "rejected" : acknowledgedIds.has(id) ? "acknowledged" : "pending"

  /* 未处理的张力。用 `projectTensions` + `openTensions` 两个领域 API 组合，
     不在这一层重新判断「什么算未处理」。 */
  const open = openTensions(projectTensions(data))
  const openById = new Map(open.map((tension) => [tension.id, tension]))

  /* authored 批评的靶心 → 张力 id。用来压掉机械生成的那一条。 */
  const authoredCritiqueKeys = new Set<string>()
  for (const critique of document.critiques) {
    if (critique.target.type === "claim") {
      authoredCritiqueKeys.add(`${critique.issue}::${critique.target.id}`)
    }
  }

  /* ---- Class 2 · critique ------------------------------------------------- */

  const critiques: ReviewerNote[] = []

  for (const critique of document.critiques) {
    critiques.push(authoredCritique(data, critique, stateOf(critique.id), openById, labels))
  }

  for (const tension of open) {
    if (authoredCritiqueKeys.has(tension.id)) continue
    critiques.push(derivedCritique(data, tension, copy))
  }

  /* 读法检查：附着在论断上，但不是张力。 */
  for (const claim of data.claims) {
    if (claim.status === "retracted") continue
    const trapBasis = readingTrapFor(data, claim.id)
    if (!trapBasis) continue
    /* 同一个论断上已经有 authored 的批评时不重复——人写的优先。 */
    if (document.critiques.some((c) => c.target.type === "claim" && c.target.id === claim.id)) continue
    critiques.push({
      id: `rev-reading-trap-${claim.id}`,
      outputClass: "critique",
      provenance: "derived",
      state: "pending",
      claimId: claim.id,
      tensionId: null,
      tensionKind: null,
      severity: "notable",
      text: copy.readingTrap.text,
      detail: trapBasis,
      nextStep: copy.readingTrap.next,
      passageIds: [],
      passageLabels: [],
    })
  }

  /* ---- Class 1 · factual -------------------------------------------------- */

  const factuals = document.factual.map((output) =>
    authoredFactual(data, output, stateOf(output.id), labels),
  )

  /* ---- Class 3 · suggestion ----------------------------------------------- */

  const suggestions = document.suggestions.map((output) =>
    authoredSuggestion(output, stateOf(output.id)),
  )

  /* ---- 历史投影：被驳回的输出 --------------------------------------------- */

  const rejectedList = rejectedOutputs.map((output) =>
    describeOutput(data, output, "rejected", copy, labels),
  )

  return {
    critiques: sortCritiques(critiques),
    factuals,
    suggestions,
    rejected: rejectedList,
    counts: {
      critiques: critiques.length,
      factuals: factuals.length,
      suggestions: suggestions.length,
      rejected: rejectedList.length,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* 单条构造                                                                     */
/* -------------------------------------------------------------------------- */

function sortCritiques(notes: ReviewerNote[]): ReviewerNote[] {
  const weight = (note: ReviewerNote) => (note.severity === "blocking" ? 0 : 1)
  return [...notes].sort((a, b) => weight(a) - weight(b) || a.id.localeCompare(b.id))
}

function authoredCritique(
  data: ResearchData,
  critique: AiCritiqueOutput,
  state: ReviewerState,
  openById: Map<Id, Tension>,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): ReviewerNote {
  const claimId = critique.target.type === "claim" ? critique.target.id : null
  const tensionId = claimId ? `${critique.issue}::${claimId}` : null
  const tension = tensionId ? openById.get(tensionId) : undefined

  /* 它说的东西领域层是不是也能 derive 出来？如果是，就**指向那条张力**，
     而不是造一条平行的问题。 */
  const linkedTensionId = tension ? tension.id : null

  const opposing = (critique.opposingPassageIds ?? [])
    .map((id) => getPassage(data, id))
    .filter((passage): passage is Passage => passage !== undefined)

  return {
    id: critique.id,
    outputClass: "critique",
    provenance: "authored",
    state,
    claimId,
    tensionId: linkedTensionId,
    tensionKind: tension?.kind ?? critique.issue,
    severity: tension?.severity ?? null,
    text: critique.rationale,
    detail: describeTensionSubject(data, tension),
    nextStep: "",
    passageIds: opposing.map((passage) => passage.id),
    passageLabels: opposing.map((passage) => formatPassageLabel(passage, labels)),
  }
}

function derivedCritique(data: ResearchData, tension: Tension, copy: ReviewerCopy): ReviewerNote {
  const claimId = tension.subject.claimId
  return {
    id: `rev-${tension.id}`,
    outputClass: "critique",
    provenance: "derived",
    state: "pending",
    claimId,
    /* 指向**已经存在**的那条张力。这是「不建立第二套事实」的落点。 */
    tensionId: tension.id,
    tensionKind: tension.kind,
    severity: tension.severity,
    text: copy.critiqueText[tension.kind],
    detail: describeTensionSubject(data, tension),
    nextStep: copy.critiqueNext[tension.kind],
    passageIds: [],
    passageLabels: [],
  }
}

function authoredFactual(
  data: ResearchData,
  output: AiFactualOutput,
  state: ReviewerState,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): ReviewerNote {
  const passages = output.passageIds
    .map((id) => getPassage(data, id))
    .filter((passage): passage is Passage => passage !== undefined)

  /* 附着目标由**领域层推**：这条事实引用的片段被哪些论断引用过。
     推不出来就附着不上——而不会退回「附着到随便一条论断」。 */
  const claimIds = new Set<Id>()
  for (const passage of passages) {
    for (const claim of claimsUsingPassage(data, passage.id)) claimIds.add(claim.id)
  }
  const claimId = claimIds.size > 0 ? [...claimIds].sort()[0]! : null

  return {
    id: output.id,
    outputClass: "factual",
    provenance: "authored",
    state,
    claimId,
    tensionId: null,
    tensionKind: null,
    severity: null,
    text: output.statement,
    detail: "",
    nextStep: "",
    passageIds: passages.map((passage) => passage.id),
    passageLabels: passages.map((passage) => formatPassageLabel(passage, labels)),
    sourceType: output.sourceType,
  }
}

function authoredSuggestion(output: { id: Id; text: string; rationale?: string }, state: ReviewerState): ReviewerNote {
  return {
    id: output.id,
    outputClass: "suggestion",
    provenance: "authored",
    state,
    /* 契约允许建议零引用，所以它**没有靶心**——不是「还没推出来」。
       给它编一个附着目标是伪造信息；它渲染在链条之外，见 §18。 */
    claimId: null,
    tensionId: null,
    tensionKind: null,
    severity: null,
    text: output.text,
    rationale: output.rationale,
    detail: "",
    nextStep: "",
    passageIds: [],
    passageLabels: [],
  }
}

/** 被驳回的输出也要能渲染——它进了历史投影，不是消失了。 */
function describeOutput(
  data: ResearchData,
  output: AiOutput,
  state: ReviewerState,
  copy: ReviewerCopy,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): ReviewerNote {
  const base =
    output.kind === "factual"
      ? authoredFactual(data, output, state, labels)
      : output.kind === "critique"
        ? critiqueForHistory(output, state)
        : authoredSuggestion(output, state)
  return { ...base, text: `${copy.rejectedPrefix}${base.text}` }
}

function critiqueForHistory(critique: AiCritiqueOutput, state: ReviewerState): ReviewerNote {
  const claimId = critique.target.type === "claim" ? critique.target.id : null
  return {
    id: critique.id,
    outputClass: "critique",
    provenance: "authored",
    state,
    claimId,
    tensionId: null,
    tensionKind: critique.issue,
    severity: null,
    text: critique.rationale,
    /* 历史条目不再附细节：它已经不在审稿意见里了，多给一行信息只会
       让人以为它还可以被处理。它仍然带着靶心与状态，所以可追溯。 */
    detail: "",
    nextStep: "",
    passageIds: [],
    passageLabels: [],
  }
}

/* -------------------------------------------------------------------------- */
/* 细节渲染                                                                     */
/* -------------------------------------------------------------------------- */

function formatPassageLabel(
  passage: Passage,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): string {
  const { page, anchor, tStart } = passage.locator
  if (typeof page === "number") return labels.page(page)
  if (typeof tStart === "number") return labels.timecode(tStart)
  if (anchor) return labels.anchor(anchor)
  return "—"
}

/**
 * 一条张力的**具体事实**：涉及几个来源、几条链接、哪个来源。
 *
 * 这是投影算出来的（不是文案），因为它是可核实的事实：
 * 「2 处引用 / 1 个来源」是一个数字，不是一句话。
 */
function describeTensionSubject(data: ResearchData, tension: Tension | undefined): string {
  if (!tension) return ""

  const linkCount = tension.subject.linkIds?.length ?? 0
  const sourceIds = tension.subject.sourceIds ?? []
  const titles = sourceIds
    .map((id) => data.sources.find((source) => source.id === id)?.title)
    .filter((title): title is string => title !== undefined)

  const parts: string[] = []
  if (linkCount > 0) parts.push(`${linkCount} 处引用`)
  if (sourceIds.length > 0) parts.push(`${sourceIds.length} 个来源`)
  if (titles.length === 1) parts.push(titles[0]!)
  return parts.join(" · ")
}
