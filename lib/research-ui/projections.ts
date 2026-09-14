/**
 * Argument Chain projections —— 领域层 → 界面的**唯一**组装点。
 *
 * ## 它做什么，不做什么
 *
 * ```
 * lib/research/（领域真相）      ← 所有数值、所有判断、所有派生
 *        ↓
 * lib/research-ui/projections   ← 组装成界面能直接渲染的结构（本文件）
 *        ↓
 * components/research/          ← 只负责画，不重新判断任何事
 * ```
 *
 * 这里**没有**新的业务规则。它只做三件事：
 *   1. 把 domain 的函数调一遍，把结果放进一个可以一次性渲染的结构里；
 *   2. 把「证据」按**关系契约**的 `order` 排序（不是按 JSX 里手写的顺序）；
 *   3. 把「需要哪类材料」编译成**可渲染的字段**，而不是留给组件去拼字符串。
 *
 * ## 一条刻意保持的设计
 *
 * `gap` 里的每一个字段都能追到 domain 的一个已知事实——
 * 没有任何一个是本文件编出来的。缺口是**派生的**（`deriveTensions`），
 * 它「需要什么」由一个显式的 `MISSING_EVIDENCE_REQUIREMENT` 表决定，
 * 而那张表只读 `Claim.kind`（一个 declared semantic）与问题文本。
 * 所以「需要 2024 年之后的一手产能数据」这句话不是文学创作，
 * 它是 `kind: "prediction"` + 问题「产能」两个字推出来的。
 *
 * ## 它不依赖 React
 *
 * 纯函数，可被 Node 直接导入、可被单测直接调用。这一点是刻意的：
 * UI 组装逻辑一旦长在组件里，就只能靠渲染一棵 DOM 去测它。
 */

import {
  type Claim,
  type ClaimBasisStatus,
  type EvidenceLevel,
  type Id,
  type Passage,
  type Question,
  type ResearchData,
  type Source,
  type SourceType,
  type Stance,
  type Tension,
  type TensionKind,
  activeClaims,
  evidenceForClaim,
  getPassage,
  getSourceForPassage,
  getRelationPresentation,
  openTensions,
  projectClaimVerification,
  projectKnownLimitations,
  projectResolvedTensions,
  projectTensions,
  type KnownLimitation,
  type ResolvedTension,
} from "@/lib/research"
import {
  projectReviewerBoard,
  type ReviewerBoard,
  type ReviewerCopy,
  type ReviewerNote,
} from "./reviewer"

/* -------------------------------------------------------------------------- */
/* 形状                                                                         */
/* -------------------------------------------------------------------------- */

/** 一条证据的可渲染形态。stance 的语义全部来自 `presentation`，本层不做解释。 */
export interface ClaimEvidence {
  linkId: Id
  stance: Stance
  /** 契约里的完整表达。组件**只**读这个，不得自己判断 stance。 */
  presentation: ReturnType<typeof getRelationPresentation>
  passageId: Id
  /** 原文。不是摘要。 */
  passageText: string
  /** 人话定位：「第 12 页」/「锚点 2026-H1」/「00:12:40」。 */
  locatorLabel: string
  /** 窄屏标签，由契约的 `mobile.labelTemplate` 生成。 */
  mobileLabel: string
  /** 可访问名，由契约的 `a11y.accessibleNameTemplate` 生成。 */
  accessibleName: string
  /** 论断这一级的关系播报。只有反驳有。 */
  announcement: string
  /** 桌面细指针下 DataCursor 的读数标签。 */
  cursorLabel: string
  /** 来源。解析不出来时为 undefined —— 那是一个需要被看见的事实，不是可以静默跳过的分支。 */
  source?: Source
  sourceTitle: string
  /** 引用时写下的理由。可空。 */
  note?: string
}

/** 一个缺口：它是哪一类、以及**需要哪类材料**才能填上。 */
export interface ClaimGap {
  /** 来自 domain 的张力 kind。空槽的文案由它决定，不由组件决定。 */
  kind: TensionKind
  severity: Tension["severity"]
  /**
   * 由 `Claim.kind` + 问题文本编译出的材料要求。
   *
   * 只有「那一栏空着」的缺口才有意义（见 `ClaimProjection.gaps` 的说明）——
   * 已经有证据但缺独立性的张力不会被构造成 `ClaimGap`。
   */
  requires: {
    sourceType: Extract<SourceType, "primary"> | null
    recencyAfterYear: number | null
    subject: string
  }
  /** 这条论断要回答的问题。 */
  questionText: string
}

/**
 * 「这一栏是空的」的两个 kind。
 *
 * 只有它们会让链条里出现虚线空槽。其余三种张力（有反驳 / 单一来源 /
 * 来源质量偏低）说的是「已有证据不够强」，而不是「什么都没有」——
 * 把它们也画成空槽会**撒谎**：那一栏明明有内容。
 * 它们走的是「在论断上打一个标记」这条通道（见 TensionFlag）。
 *
 * 这个联合类型是刻意的：它让「哪些情况该画空槽」成为一个可以被穷尽检查的
 * 类型问题，而不是散在组件里的 `if (kind === …)`。
 */
export type MissingEvidenceKind = Extract<TensionKind, "unsupported-claim" | "stale-source">

export function isMissingEvidenceKind(kind: TensionKind): kind is MissingEvidenceKind {
  return kind === "unsupported-claim" || kind === "stale-source"
}


export interface ClaimProjection {
  claim: Claim
  /** 论断在链条里的序号，从 1 开始。 */
  index: number
  /** 它属于哪个子问题（顶层问题时为 undefined）。 */
  question?: Question
  /** 按契约 order 排好序的证据。反驳 → 支持 → 限定 → 背景。 */
  evidence: ClaimEvidence[]
  /** 按 stance 分组的数量。键来自 `ALL_STANCES`，不是手写的四个分支。 */
  evidenceCountByStance: Record<Stance, number>
  basisStatus: ClaimBasisStatus
  confidence: EvidenceLevel
  verified: boolean
  /**
   * **只有「那一栏是空的」缺口**：虚线空槽 + 需要哪类材料。
   * 见 `MissingEvidenceKind`——把它做成有类型的通道，是为了让
   * 「有证据的论断不该被画成空槽」成为编译期就不可能违反的事。
   */
  gaps: ClaimGap[]
  /**
   * 需要在论断上打标记、但**不**该画空槽的张力种类。
   *
   * 例：`contradictory-evidence` 意味着「有反驳」——而反驳本身就是列表里的
   * 一条证据。在它旁边再画一个「尚无证据支撑」的空槽是**自相矛盾**的
   * （第一版就是这样，截图里 `clm-yield-advantage` 四条证据之上挂着一个
   * 「尚无证据支撑」的断点，两条陈述互相否认）。
   */
  flags: TensionKind[]
  /**
   * 人已经**接受**的局限，挂在这条论断上（Phase E 新增）。
   *
   * 它是 `flags` 的下一站：一条张力被接受之后，它不再是「待处理标记」，
   * 而是一句写下来的边界声明。所以两者必须分开——合并会让「接受」
   * 看起来像「还在提醒你」。
   */
  limitations: KnownLimitation[]
  /** 附着在这条论断上的审稿意见（critique + factual）。Phase F 新增。 */
  reviewerNotes: ReviewerNote[]
  /** 生效的张力总数（含已处置）。用于「已闭合 N 项」。 */
  tensionCount: number
}

export interface QuestionGroup {
  question: Question
  claims: ClaimProjection[]
  /**
   * 这一组是不是**主问题自己**的那些论断。
   *
   * 用途是去重：主问题的文本已经钉在页面顶端（Anchored Question），
   * 在链条里再把它当组标题渲染一次，就是把同一句话在同一屏上说两遍。
   * 第一版就是这样，截图里顶部和第一条论断上方是同一句问句。
   *
   * 所以主问题组**没有给视觉读者的标题**（它仍然有 `aria-label` 给读屏用户：
   * 「直接回答这个问题」是一个真实的分组信息，只是不需要用大字再说一遍）。
   */
  isRoot: boolean
}

/**
 * Running Head 要的全部事实。
 *
 * `disposal` 是三个处置状态各自的数量。**它替代了 Phase E 的
 * `closedTensionCount`**：那个数与后来出生的 `resolvedTensions` 一样，
 * 是把两个相反的出口加在一起得到的单一读数——而「已处理 N 项」
 * 正是这一整个阶段要防止出现的那句话。
 */
export interface ResearchAnchor {
  /** 工作代号。数据集里 `title` 刻意留空——它不该被硬编码进数据。 */
  codename: string
  questionText: string
  scopeIn: string[]
  scopeOut: string[]
  disposal: {
    /** 洞还在，还没人决定怎么办。 */
    open: number
    /** 洞还在，人决定带着它交付。 */
    limitations: number
    /** 洞被事实填上了。 */
    resolved: number
  }
}

export interface ArgumentChain {
  anchor: ResearchAnchor
  /** 按主要问题 → 子问题的顺序分组。空组不出现。 */
  groups: QuestionGroup[]
  claims: ClaimProjection[]
  openTensions: Tension[]
  /**
   * 三个处置状态**分开**投影（Phase E 起）。
   *
   * ```
   * openTensions       未处理   —— 洞还在，还没人决定怎么办
   * limitations        已知局限 —— 洞还在，人决定带着它交付
   * resolvedTensions   已解决   —— 洞被事实填上了
   * ```
   *
   * ## ⚠ `resolvedTensions` 的类型在 Phase G+H 变了，而且这是一个真实的修复
   *
   * 它曾经是 `Tension[]`（= `projectTensions(data)` 里 resolution 为 resolved 的那些）。
   * 那个写法**按构造恒为空**：`projectTensions` 只遍历 `deriveTensions(data)`，
   * 而 `resolved` 的**前提**就是事实改变——事实一变，那条张力就再也推导不出来，
   * 于是处置记录存在、却没有任何 `Tension` 对象携带它。
   *
   * 这正是「已解决」那段界面从未渲染过的根本原因，而不只是「界面到达不了它」。
   * 现在它和 `limitations` 一样从 **dispositions** 出发——
   * 「这里曾经有一个洞，现在没了」是一件历史事实，不是当前数据能重新导出的状态。
   */
  resolvedTensions: ResolvedTension[]
  limitations: KnownLimitation[]
  /** Phase F —— 审稿意见板（三类分开持有）。 */
  reviewer: ReviewerBoard
  /** 第一视觉主角：**第一个**未处置空缺的论断。首屏卡片用它。 */
  primaryGap: { claim: ClaimProjection; gap: ClaimGap } | null
  /** 论断 id → 序号。Tension Rail 要把张力翻成「论断 N」。 */
  claimIndex: Map<Id, number>
}

/* -------------------------------------------------------------------------- */
/* 定位                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 把一个 `Passage.locator` 变成人话。
 *
 * 定位文本属于**呈现层**，不属于关系契约——契约的 `formatRelationMobileLabel`
 * 明确要求调用方提供 `locatorLabel`，因为「第 4 页第 2 段」与「00:12:40」
 * 是两种不同的定位方式，格式化规则不该被焊进语义层。
 *
 * 参数取 `{ locator }` 而不是整个 `Passage`：交付物的引用（`FindingCitation`）
 * 带着同样的 locator，但它不是一个 `Passage`。要求整个 Passage 会逼调用方
 * 伪造一个，或者写一个 `as never` ——两种都比放宽这一个参数糟。
 *
 * `labels` 由调用方注入（来自 i18n），因为这里是纯函数，不读词典。
 */
export function formatLocator(
  passage: { locator: Passage["locator"] },
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): string {
  const { page, anchor, tStart } = passage.locator
  if (typeof page === "number") return labels.page(page)
  if (typeof tStart === "number") return labels.timecode(tStart)
  if (anchor) return labels.anchor(anchor)
  return "—"
}

/* -------------------------------------------------------------------------- */
/* 材料要求                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 预测型论断的时效下限。
 *
 * 一个预测在它发生的年份之后才可能被证伪/证实，所以「拐点是否出现」这类判断
 * 需要的是**发表在这个年份之后的**材料，而不是三年前的行业预期——
 * 后者正是这条论断目前唯一的邻居（`src-legacy-forecast`，已失效）。
 *
 * 取的是数据集的时间基准年，而不是 `Date.now()`：这个产品里没有任何派生值
 * 可以依赖运行时刻，否则截图与测试就不再可复现。
 */
const PREDICTION_RECENCY_FLOOR_YEAR = 2024

/**
 * `Claim.kind` → 需要哪类材料。
 *
 * ⚠ 这张表读的是 `Claim.kind`，而 `kind` 在领域层被明确标注为
 * **declared semantic（不参与任何 derived rule）**。这里没有违反那条标注：
 * 它不改变任何派生值（强度、依据状态、张力都不看它），它只决定
 * 「空白处该写什么字」。等 `kind` 真的参与派生时，规则、测试与消费方
 * 应当一起进来（见 `types.ts` 的 ClaimKind 说明）。
 */
const MISSING_EVIDENCE_REQUIREMENT: Record<Claim["kind"], { primary: boolean; recency: boolean }> = {
  // 断言型：需要能核对的材料，但不特别要求一手或时效。
  assertion: { primary: false, recency: false },
  // 预测型：**必须**是一手 + 新近。二手转述的预期不足以支撑一个预测。
  prediction: { primary: true, recency: true },
  // 定义型：定义不靠材料支撑，靠约定。
  definition: { primary: false, recency: false },
}

function buildGap(
  data: ResearchData,
  claim: Claim,
  tension: Tension,
  question: Question | undefined,
): ClaimGap {
  const requirement = MISSING_EVIDENCE_REQUIREMENT[claim.kind]
  return {
    kind: tension.kind,
    severity: tension.severity,
    requires: {
      sourceType: requirement.primary ? "primary" : null,
      recencyAfterYear: requirement.recency ? PREDICTION_RECENCY_FLOOR_YEAR : null,
      subject: question?.text ?? "",
    },
    questionText: question?.text ?? "",
  }
}

/* -------------------------------------------------------------------------- */
/* 证据的可见窗口                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 窄屏一条论断默认显示多少条证据。
 *
 * 为什么需要它：390px 下一条论断可以有 4 条证据，每条两行引文——
 * 那会让**一条论断占满整屏**，链条就断了（firstVisual 要的是
 * 「纵向连续的链条」，不是「一条一条翻」）。
 *
 * 3 而不是 2：数据集里最复杂的一条论断（clm-yield-advantage）恰好是四条证据、
 * 四个 stance 各一条。留 3 条可见 + 1 条折起，用户第一眼就能看到
 * 「反驳 / 支持 / 限定」三种同时存在——那正是这一屏要传达的事实。
 */
export const VISIBLE_EVIDENCE_LIMIT = 3

/**
 * 计算证据的可见窗口。
 *
 * **顺序优先**，不做「优先显示某个 stance」这种特判——那会把契约里的
 * `order` 变成一个建议而不是规则。契约说反驳最先，那么折叠时必须先保住
 * 排在最前面的那些，否则「逆流」在折叠状态下就消失了。
 *
 * 两个数：`visible` 是窗口内的（保持契约顺序），`hiddenCount` 是折起的条数。
 */
export function evidenceWindow(
  evidence: ClaimEvidence[],
  limit: number = VISIBLE_EVIDENCE_LIMIT,
): { visible: ClaimEvidence[]; hiddenCount: number } {
  if (evidence.length <= limit) return { visible: evidence, hiddenCount: 0 }
  return { visible: evidence.slice(0, limit), hiddenCount: evidence.length - limit }
}

/* -------------------------------------------------------------------------- */
/* 组装                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 把一次研究的全部数据组装成 Argument Chain。
 *
 * 顺序规则：主问题在前，其后是它自己的论断，再是各子问题（按数据里的顺序）。
 * 子问题的顺序**不排序**——数据集的顺序就是研究者的记录顺序，重排它
 * 等于替研究者重新组织他的论证。
 */
export function projectArgumentChain(
  data: ResearchData,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
  reviewerCopy: ReviewerCopy,
): ArgumentChain {
  const claims = activeClaims(data)
  const tensions = projectTensions(data)
  const open = openTensions(tensions)

  /* 两个「已处置」出口分别从**各自的处置记录**取，不从 `tensions` 里筛。
     理由见 `ArgumentChain.resolvedTensions` 的说明：`resolved` 以事实改变为前提，
     而事实一变 `deriveTensions` 就不再产出那条张力——从 `tensions` 里筛
     按构造恒为空。 */
  const resolved = projectResolvedTensions(data)
  const limitations = projectKnownLimitations(data)
  const reviewer = projectReviewerBoard(data, reviewerCopy, labels)

  const limitationsByClaim = new Map<Id, KnownLimitation[]>()
  for (const limitation of limitations) {
    if (!limitation.claimId) continue
    const list = limitationsByClaim.get(limitation.claimId)
    if (list) list.push(limitation)
    else limitationsByClaim.set(limitation.claimId, [limitation])
  }

  const notesByClaim = new Map<Id, ReviewerNote[]>()
  for (const note of [...reviewer.critiques, ...reviewer.factuals]) {
    if (!note.claimId) continue
    const list = notesByClaim.get(note.claimId)
    if (list) list.push(note)
    else notesByClaim.set(note.claimId, [note])
  }

  /*
   * ⚠ 这里是 Phase E 修正的一个**真实的界面缺陷**，值得写下来。
   *
   * 一开始 gaps 与 flags 都从 `openTensions` 取。后果：用户一旦把一条
   * 「无证据支撑」接受为已知局限，那条论断上的**虚线空槽就消失了**——
   * 洞变成了看不见的。而那正是这一整个产品在防的事：屏幕上的自欺
   * 和结论里的自欺是同一件事。
   *
   * 根因是两类东西被当成了同一类：
   *
   *   gap（空槽）   **事实**——那一栏是空的。接受一个局限不会把栏填上。
   *   flag（标记）  **待办**——这里需要你处理。接受之后就处理完了。
   *
   * 所以现在：空槽来自**全部**被推导出来的张力（处置与否都不影响它），
   * 标记只来自**未处理**的张力。这也让首屏那张「最大缺口」卡片在用户
   * 接受局限之后**不会换一条**——它仍然指着同一个真实的洞。
   */
  const gapsByClaim = new Map<Id, Tension[]>()
  for (const tension of tensions) {
    const list = gapsByClaim.get(tension.subject.claimId)
    if (list) list.push(tension)
    else gapsByClaim.set(tension.subject.claimId, [tension])
  }

  const openByClaim = new Map<Id, Tension[]>()
  for (const tension of open) {
    const list = openByClaim.get(tension.subject.claimId)
    if (list) list.push(tension)
    else openByClaim.set(tension.subject.claimId, [tension])
  }

  const tensionCountByClaim = new Map<Id, number>()
  for (const tension of tensions) {
    tensionCountByClaim.set(
      tension.subject.claimId,
      (tensionCountByClaim.get(tension.subject.claimId) ?? 0) + 1,
    )
  }

  const claimIndex = new Map<Id, number>()

  /* 问题查找表。领域层没有 `getQuestion`（它只有 `getClaim` / `getPassage` /
     `getSource` / `getLink`），所以在这里建一次，而不是给领域层补一个只被界面
     用到的访问器。查找表只在本次组装内有效，不是第二份事实来源。 */
  const questionById = new Map(data.questions.map((question) => [question.id, question]))
  const getQuestion = (id: Id | null | undefined): Question | undefined =>
    id ? questionById.get(id) : undefined

  const projected: ClaimProjection[] = claims.map((claim, position) => {
    const index = position + 1
    claimIndex.set(claim.id, index)
    const question = getQuestion(claim.questionId)
    return projectClaim(data, claim, index, question, {
      gaps: gapsByClaim.get(claim.id) ?? [],
      openTensions: openByClaim.get(claim.id) ?? [],
      tensionCount: tensionCountByClaim.get(claim.id) ?? 0,
      labels,
      limitations: limitationsByClaim.get(claim.id) ?? [],
      reviewerNotes: notesByClaim.get(claim.id) ?? [],
    })
  })

  /* 分组：主问题 + 各子问题。没有活跃论断的问题不出现——空标题是噪音。 */
  const rootQuestion = getQuestion(data.research.questionId)
  const groups: QuestionGroup[] = []
  const pushGroup = (question: Question | undefined) => {
    if (!question) return
    const groupClaims = projected.filter((item) => item.claim.questionId === question.id)
    if (groupClaims.length > 0) {
      groups.push({ question, claims: groupClaims, isRoot: question.id === data.research.questionId })
    }
  }
  pushGroup(rootQuestion)
  for (const question of data.questions) {
    if (question.id === data.research.questionId) continue
    // 被放弃的子问题没有活跃论断时自然落空；有论断时仍然显示——状态是记录，不是删除。
    pushGroup(question)
  }

  /* 第一视觉主角：**第一条那栏是空的**论断。
     用 `gaps` 而不是 `openGaps`——首屏那张卡片说的是「尚无证据支撑」，
     它只能指向一个真的没有证据的位置。 */
  let primaryGap: ArgumentChain["primaryGap"] = null
  for (const item of projected) {
    const gap = item.gaps[0]
    if (gap) {
      primaryGap = { claim: item, gap }
      break
    }
  }

  /* 主问题文本：它必须是**研究自己的**问题，不是子问题的第一句。 */
  const anchorQuestion = rootQuestion ?? data.questions[0]

  return {
    anchor: {
      codename: data.research.title ?? "",
      questionText: anchorQuestion?.text ?? "",
      scopeIn: data.research.scope.in,
      scopeOut: data.research.scope.out,
      disposal: {
        open: open.length,
        limitations: limitations.length,
        resolved: resolved.length,
      },
    },
    groups,
    claims: projected,
    openTensions: open,
    resolvedTensions: resolved,
    limitations,
    reviewer,
    primaryGap,
    claimIndex,
  }
}

/** 单条论断的组装。导出来是因为测试要能对**一条**论断断言，而不必先组装全链。 */
export function projectClaim(
  data: ResearchData,
  claim: Claim,
  index: number,
  question: Question | undefined,
  options: {
    /**
     * 这条论断上**全部**被推导出来的张力（含已处置的）。
     * 本函数只把「那一栏是空的」那些分流成 `gaps`——因为空槽描述的是**事实**，
     * 它不会因为人接受了一个局限而消失。
     */
    gaps: Tension[]
    /** 只含**未处置**的张力。它们才产生「待处理」标记。 */
    openTensions: Tension[]
    tensionCount: number
    labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string }
    /** 这条论断上已经被接受的局限。 */
    limitations: KnownLimitation[]
    /** 附着在这条论断上的审稿意见。 */
    reviewerNotes: ReviewerNote[]
  },
): ClaimProjection {
  const evidence = projectClaimEvidence(data, claim.id, options.labels)
  const verification = projectClaimVerification(data, claim.id)

  const evidenceCountByStance = {} as Record<Stance, number>
  for (const item of evidence) {
    evidenceCountByStance[item.stance] = (evidenceCountByStance[item.stance] ?? 0) + 1
  }

  /* 缺口的分流：只有「那一栏空着」的才成为空槽。
     这一条**必须**在这里做，而不是在组件里——组件拿不到 `evidence` 的全貌，
     它会（第一版就是）把有证据的论断也画成空槽。 */
  const gaps: ClaimGap[] = []
  for (const tension of options.gaps) {
    if (isMissingEvidenceKind(tension.kind)) {
      gaps.push(buildGap(data, claim, tension, question))
    }
  }

  /* 标记只来自**未处理**的张力：它是一条待办，处置完就该消失。 */
  const flags: TensionKind[] = []
  for (const tension of options.openTensions) {
    if (!isMissingEvidenceKind(tension.kind)) flags.push(tension.kind)
  }

  return {
    claim,
    index,
    question,
    evidence,
    evidenceCountByStance,
    basisStatus: verification.basisStatus,
    confidence: verification.confidence,
    verified: verification.verified,
    gaps,
    flags,
    limitations: options.limitations,
    reviewerNotes: options.reviewerNotes,
    tensionCount: options.tensionCount,
  }
}

/**
 * 一条论断的证据，**按关系契约的 `order` 排序**。
 *
 * 排序键来自 `getRelationPresentation(stance).order`（反驳 → 支持 → 限定 → 背景），
 * 而不是组件里写死的四个分支。契约改顺序时界面自动跟着改——
 * 这正是「契约是唯一入口」在排序上的落点。
 *
 * 同 stance 内保持数据的原始顺序（`map` 天然稳定，随后 `sort` 也是稳定的），
 * 因为那是研究者写下它们的顺序。
 */
export function projectClaimEvidence(
  data: ResearchData,
  claimId: Id,
  labels: { page: (n: number) => string; anchor: (a: string) => string; timecode: (s: number) => string },
): ClaimEvidence[] {
  return evidenceForClaim(data, claimId)
    .map((link) => {
      const presentation = getRelationPresentation(link.stance)
      const passage = getPassage(data, link.passageId)
      const source = getSourceForPassage(data, link.passageId)
      /* 片段解析不出来时留一个显式的空壳，而不是把它从列表里丢掉。
         引用指向不存在的原文，是这个产品最不能静默的一种坏数据。 */
      const passageText = passage?.text ?? ""
      const locatorLabel = passage ? formatLocator(passage, labels) : "—"
      return {
        linkId: link.id,
        stance: link.stance,
        presentation,
        passageId: link.passageId,
        passageText,
        locatorLabel,
        mobileLabel: presentation.mobile.labelTemplate
          .replaceAll("{label}", presentation.label)
          .replaceAll("{locator}", locatorLabel),
        accessibleName: presentation.a11y.accessibleNameTemplate
          .replaceAll("{label}", presentation.label)
          .replaceAll("{locator}", locatorLabel)
          .replaceAll("{text}", passageText.trim()),
        announcement: presentation.a11y.claimAnnouncement ?? "",
        /* DataCursor 的标签：定位 + 来源名。上限 48 字由组件侧再兜一次。 */
        cursorLabel: source ? `${locatorLabel} · ${source.origin}` : locatorLabel,
        source,
        sourceTitle: source?.title ?? "",
        note: link.note,
      } satisfies ClaimEvidence
    })
    .sort((a, b) => a.presentation.order - b.presentation.order)
}
