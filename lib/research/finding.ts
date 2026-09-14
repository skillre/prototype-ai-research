/**
 * Finding 投影 —— 交付物的读取面。
 *
 * ## Finding 是什么
 *
 * 交付物。**稳定、可分享、可引用**（Phase 2 IA）。所以它不是 dashboard summary，
 * 也不是「把页面上已有的东西再列一遍」——它是研究者署名的几句话，
 * 加上它们凭什么成立、以及它们不覆盖什么。
 *
 * ## 三条契约，全部在这里落实
 *
 * ### ① 置信度不是一个可以自己填的数字
 *
 * `deriveFindingConfidenceCeiling` 说上限是**所引用论断里最弱的那一条**。
 * 本模块只**读**它与 `checkFindingConfidence` 的结果，绝不重算。
 * 一个页面自己算一遍置信度，就会出现两个数字，而它们会在某次改动后分叉。
 *
 * 超过上限时**不静默修正**：`contractOk: false` 被原样交给页面去报错。
 * 静默把 3 改成 2 会让一份不诚实的交付物看起来正常——而「看起来正常」
 * 正是这个产品要防的东西。
 *
 * ### ② 建议永远进不来
 *
 * `mayEnterFinding(suggestion) === false`。这里不是「过滤一下」，
 * 是**三类输出各自分开持有**（`buildAiDocument`），页面拿不到一个混合列表
 * 可以顺手 map 一遍。AI 事实输出要进来还得过 `passageIds >= 1`
 * 那一条（由 `validateAiOutput` 在构造时守住）。
 *
 * ### ③ 交付物的措辞不是投影的输出
 *
 * 见 `Finding.knownLimitations` 与 `Finding.knownLimitationRefs` 的说明。
 * 本模块把「已经写进去的」「还没写进去的」「写进去但事实已经变了的」
 * 三种状态**分开**报出来，让人决定怎么办——它不会替人写话。
 */

import { buildAiDocument, mayEnterFinding } from "./ai-reviewer"
import {
  activeClaims,
  checkFindingConfidence,
  deriveFindingConfidenceCeiling,
  evidenceForClaim,
  getSourceForPassage,
} from "./projections"
import { openTensions, projectKnownLimitations, projectResolvedTensions, projectTensions } from "./tensions"
import type {
  AiFactualOutput,
  AiOutput,
  Claim,
  EvidenceLevel,
  Finding,
  Id,
  IsoTimestamp,
  Passage,
  Research,
  ResearchData,
  Source,
  Stance,
  Tension,
  TensionKind,
} from "./types"

/* -------------------------------------------------------------------------- */
/* 引用                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 一条引用。
 *
 * 落点是 **Passage**，不是 Source（见 `types.ts` 的 `Passage` 说明：
 * 「参见那份报告」在评审会上答不上来，「第 4 页第 2 段」才是）。
 *
 * `verifiable` 是**派生**的：来源存在且 `validity === "ok"`。
 * 它在界面上的用途是把「你引用了但它已经查不到了」这一类 citation
 * 明确标出来——不是把它藏起来。一条不可核对的引用**仍然是引用**，
 * 它只是不能算数。
 */
export interface FindingCitation {
  linkId: Id
  claimId: Id
  claimIndex: number
  passageId: Id
  passageText: string
  locator: Passage["locator"]
  stance: Stance
  /** 解析不出来时为 undefined —— 那是需要被看见的事实。 */
  source?: Source
  verifiable: boolean
}

/* -------------------------------------------------------------------------- */
/* 已知局限的三个状态                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 已经写进交付物的一条边界，以及**它是否还对得上现状**。
 *
 * ```
 * ref === null        手写的边界（不来自任何处置）。交付物可以这么写。
 * overstated === true ref 有、但那条局限对应的事实已经变了
 *                     → **交付物在夸大一条已经不存在的限制**
 * ```
 *
 * 第二种是这一整个产品最不能静默的坏状态之一：交付物里写着一条边界，
 * 而工作区里那个洞已经被填上了。它只能被查出来，不可能被猜出来——
 * 所以 refs 是一个显式字段，而不是靠比对字符串。
 */
export interface FindingWrittenLimitation {
  /** 交付物里的原话。**这是成稿**，由人写。 */
  wording: string
  /** 它对哪条已接受的局限负责。`null` = 手写的边界。 */
  ref: Id | null
  /** ref 解析出来的现状记录。 */
  limitation: KnownLimitationView | null
  /** ref 还认得出来，但事实已经变了。 */
  overstated: boolean
  /** ref 指向一条已经不存在的处置记录。 */
  dangling: boolean
}

/** 一条已接受的局限（交付物视角的只读快照）。 */
export interface KnownLimitationView {
  tensionId: Id
  kind: TensionKind
  claimId: Id
  claimIndex: number
  /** 处置时写下的理由。它是**候选措辞的原料**，不是成稿。 */
  dispositionReason: string
  acceptedAt: IsoTimestamp
  stillRaised: boolean
}

/**
 * 一条**已接受但还没写进交付物**的局限。
 *
 * 这是 `accepted-as-limitation` 与 `Finding.knownLimitations` 之间的差集。
 * 它的存在本身就是产品要传达的一句话：**在工作区里接受一条边界，
 * 不等于交付物里已经说明了它。**
 *
 * 界面上它带一份**候选措辞**（由 `kind` + 处置理由拼出），但候选人必须
 * 自己写进 `Finding.knownLimitations` 才算数——把处置理由当成成稿，
 * 等于让工作区的随手记录自动变成对外署名的话。
 */
export interface FindingLimitationCandidate {
  tensionId: Id
  kind: TensionKind
  claimId: Id
  claimIndex: number
  dispositionReason: string
  acceptedAt: IsoTimestamp
  stillRaised: boolean
}

/* -------------------------------------------------------------------------- */
/* 草稿                                                                         */
/* -------------------------------------------------------------------------- */

export interface FindingDraft {
  finding: Finding
  research: Research
  /** 研究问题。交付物的第一段。 */
  question: string
  /** 研究范围。**边界本身就是结论的一部分**，所以它进交付物。 */
  scope: { in: string[]; out: string[] }
  /** 研究状态（active / archived）。 */
  researchStatus: Research["status"]

  /** 交付物引用的论断。 */
  supportingClaims: Claim[]
  /** 论断 id → 链条里的序号。交付物要能用「论断 N」称呼它们。 */
  claimIndex: Map<Id, number>
  /** 它们各自的引用。按论断序号排序。 */
  citations: FindingCitation[]
  /** 引用了不可核对来源的引用数。 */
  unverifiableCitationCount: number

  /* --- 置信度：只读，不重算 --- */
  /** 交付物声称的强度。 */
  declaredConfidence: EvidenceLevel
  /** 上限：所引用论断里最弱的那一条。 */
  ceiling: EvidenceLevel
  /** `declaredConfidence <= ceiling`。**false 时页面必须报错，不得静默修正。** */
  contractOk: boolean
  weakestClaimId: Id | null

  /* --- 边界 --- */
  /** 写进交付物的边界，逐条带上它与现状的对齐情况。 */
  limitations: FindingWrittenLimitation[]
  /** 已接受、但还没写进交付物的局限。 */
  candidates: FindingLimitationCandidate[]
  /** 被**解决**掉的洞。它与 known limitation 必须一眼可分。 */
  resolvedCount: number

  /* --- AI --- */
  /**
   * 有资格成为交付物候选材料的 AI 输出。
   *
   * **只有 Class 1（事实抽取）**，而且按契约它每条都带 ≥1 条可解析的
   * Passage（`constructAiOutput` 在构造时就守住了）。
   */
  aiCandidates: AiFactualOutput[]
  /**
   * 被挡在交付物之外的 AI 输出。
   *
   * 计数在这里、文本不在：页面需要能说「有 N 条建议没有、也不会进入这份
   * 交付物」，但它**不能**渲染那些文本——那正是「建议不得作为正文或依据」。
   */
  excludedCount: number

  /** 交付这一刻仍然未处理的缺口。 */
  openTensions: Tension[]
}

/** 一条 AI 输出能否进入交付物。**唯一入口，页面不得自己判断 kind。** */
export function admissibleAiOutputs(data: ResearchData): AiOutput[] {
  return data.aiOutputs.filter(mayEnterFinding)
}

/**
 * 组装一份交付物的读取面。
 *
 * 纯函数：`(data, finding) => FindingDraft`。不依赖 React、时间与随机。
 */
export function projectFindingDraft(data: ResearchData, finding: Finding): FindingDraft {
  const claimIndex = new Map<Id, number>(
    data.claims.map((claim, position) => [claim.id, position + 1]),
  )

  /* 引用：按 finding.claimIds 的顺序，**不按 claims 数组的顺序**——
     交付物里论断的排列是研究者写下来的次序，重排它就是替作者改结构。 */
  const supportingClaims = finding.claimIds
    .map((claimId) => data.claims.find((claim) => claim.id === claimId))
    .filter((claim): claim is Claim => claim !== undefined)

  const citations: FindingCitation[] = []
  for (const claim of supportingClaims) {
    for (const link of evidenceForClaim(data, claim.id)) {
      const passage = data.passages.find((candidate) => candidate.id === link.passageId)
      const source = getSourceForPassage(data, link.passageId)
      citations.push({
        linkId: link.id,
        claimId: claim.id,
        claimIndex: claimIndex.get(claim.id) ?? 0,
        passageId: link.passageId,
        /* 片段解析不出来时留空串而不是把它丢掉：一条指向不存在原文的引用
           是这个产品最不能静默的坏数据。 */
        passageText: passage?.text ?? "",
        locator: passage?.locator ?? {},
        stance: link.stance,
        source,
        verifiable: source !== undefined && source.validity === "ok",
      })
    }
  }

  /* ---- 边界：三个状态分开 ---- */
  const accepted = projectKnownLimitations(data)
  const acceptedById = new Map(accepted.map((limitation) => [limitation.tensionId, limitation]))

  const limitations: FindingWrittenLimitation[] = finding.knownLimitations.map((wording, position) => {
    const ref = finding.knownLimitationRefs[position] ?? null
    if (ref === null) {
      return { wording, ref: null, limitation: null, overstated: false, dangling: false }
    }
    const limitation = acceptedById.get(ref)
    if (!limitation) {
      /* ref 指向一条不存在或不是 accepted 的处置。这是一种真实的坏状态：
         交付物声称它对某条局限负责，而那条局限查不到。 */
      return { wording, ref, limitation: null, overstated: false, dangling: true }
    }
    return {
      wording,
      ref,
      limitation: {
        tensionId: limitation.tensionId,
        kind: limitation.kind,
        claimId: limitation.claimId,
        claimIndex: claimIndex.get(limitation.claimId) ?? 0,
        dispositionReason: limitation.reason,
        acceptedAt: limitation.acceptedAt,
        stillRaised: limitation.stillRaised,
      },
      /* stillRaised === false 意味着：交付物里这条边界所指的洞已经被填上了。
         不是错误，但**必须被看见**——否则交付物会一直挂着一句已经过期的限制。 */
      overstated: !limitation.stillRaised,
      dangling: false,
    }
  })

  const referenced = new Set(finding.knownLimitationRefs.filter((ref): ref is Id => ref !== null))
  const candidates: FindingLimitationCandidate[] = accepted
    .filter((limitation) => !referenced.has(limitation.tensionId))
    .map((limitation) => ({
      tensionId: limitation.tensionId,
      kind: limitation.kind,
      claimId: limitation.claimId,
      claimIndex: claimIndex.get(limitation.claimId) ?? 0,
      dispositionReason: limitation.reason,
      acceptedAt: limitation.acceptedAt,
      stillRaised: limitation.stillRaised,
    }))

  /* ---- AI：两类分开，只有事实类能成为候选材料 ---- */
  const document = buildAiDocument(data, data.aiOutputs)

  /* ---- 置信度：只读 ---- */
  const check = checkFindingConfidence(data, finding)

  const anchorQuestion =
    data.questions.find((question) => question.id === data.research.questionId) ?? data.questions[0]

  return {
    finding,
    research: data.research,
    question: anchorQuestion?.text ?? "",
    scope: data.research.scope,
    researchStatus: data.research.status,

    supportingClaims,
    claimIndex,
    citations,
    unverifiableCitationCount: citations.filter((citation) => !citation.verifiable).length,

    declaredConfidence: finding.confidence,
    ceiling: check.ceiling,
    contractOk: check.ok,
    weakestClaimId: check.weakestClaimId ?? null,

    limitations,
    candidates,
    resolvedCount: projectResolvedTensions(data).length,

    aiCandidates: document.factual,
    excludedCount: data.aiOutputs.length - admissibleAiOutputs(data).length,

    openTensions: openTensions(projectTensions(data)),
  }
}

/**
 * 一份交付物的自检。返回的问题在测试里断言为空。
 *
 * 与 `projectFindingDraft` 分开，是因为**判定**与**呈现**是两件事：
 * 页面需要把问题显示出来（而不是自己判断有没有问题），
 * 测试需要在不渲染的情况下断言它。
 */
export interface FindingIssue {
  code: string
  message: string
}

export function validateFinding(data: ResearchData, finding: Finding): FindingIssue[] {
  const issues: FindingIssue[] = []
  const draft = projectFindingDraft(data, finding)

  if (!draft.contractOk) {
    issues.push({
      code: "finding/confidence-exceeds-ceiling",
      message: `交付物声称强度 ${draft.declaredConfidence}，但所引用论断里最弱的一条只到 ${draft.ceiling}。结论的强度不可能超过它最薄弱的一环。`,
    })
  }

  for (const citation of draft.citations) {
    if (!citation.source) {
      issues.push({
        code: "finding/citation-unresolvable",
        message: `引用 ${citation.linkId} 指向的片段没有所属来源。`,
      })
    }
  }

  for (const limitation of draft.limitations) {
    if (limitation.dangling) {
      issues.push({
        code: "finding/limitation-ref-dangling",
        message: `边界「${limitation.wording}」声称对应 ${limitation.ref}，但那条处置记录不存在。`,
      })
    }
  }

  /* AI 建议绝不允许出现在交付物正文或依据里。这里检查的是**数据**，
     页面里再查一次**渲染**（两道都要，因为它们防的是不同的东西：
     数据里的建议会被某一次「顺手 map 一下」带出去，而渲染里的建议
     会因为某个组件被复用而漏出来）。 */
  for (const output of data.aiOutputs) {
    if (output.kind !== "suggestion") continue
    const leaked = [finding.text, ...finding.knownLimitations].some((text) =>
      text.includes(output.text),
    )
    if (leaked) {
      issues.push({
        code: "finding/suggestion-leaked",
        message: `AI 建议「${output.text}」出现在交付物正文或边界里。建议永远不得作为正文或依据。`,
      })
    }
  }

  return issues
}

/** 交付物引用的全部论断是否都能解析。缺一条就是坏数据。 */
export function unresolvedFindingClaims(data: ResearchData, finding: Finding): Id[] {
  const known = new Set(activeClaims(data).map((claim) => claim.id))
  return finding.claimIds.filter((claimId) => !known.has(claimId))
}

/**
 * 交付物的置信度上限，**只转调领域层**。
 *
 * 导出它只有一个理由：让「页面不得自己算」这件事在代码里可读。
 * 它是 `deriveFindingConfidenceCeiling` 的同义包装，不引入任何新算法。
 */
export function findingConfidenceCeiling(data: ResearchData, claimIds: Id[]): EvidenceLevel {
  return deriveFindingConfidenceCeiling(data, claimIds)
}
