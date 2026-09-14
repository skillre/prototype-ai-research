/**
 * Source Index 投影 —— 「我还有哪些材料，以及它们被怎么用」。
 *
 * ## 它不是什么
 *
 * 不是文件管理器，不是知识库首页，不是表格后台。它是一个**次要视图**：
 * 论证链回答「我的论证哪里有洞」，Source Index 回答「手上有什么、
 * 哪一段被用在哪」。
 *
 * ## 为什么全部是派生的
 *
 * 和张力一样：材料与用法之间**没有一张关系表**。每一处「这段原文被论断 N
 * 以「支持」的identity使用」都是从 `EvidenceLink` 现算的。
 *
 * 这正是本文件存在的理由——如果 Source Index 自己维护一份「用法索引」，
 * 它就会成为第二个事实来源，而它与 `links` 的分叉不会有任何测试发现，
 * 直到有人在评审会上照着它念出一个错的数字。
 *
 * ## 历史投影是刻意的
 *
 * 一条已停用的链接**仍然出现在用法里**。研究轨迹的价值恰恰在于
 * 「我引用过它，后来撤了」——把停用链接从材料视图里抹掉，
 * 等于让一份材料看起来从未被用过。界面负责区分活跃与已停用，
 * 领域层不做那个取舍。
 */

import { activeLinks, getClaim, historicalLinks } from "./projections"
import { isStance } from "./relation-contract"
import type { Id, IsoTimestamp, Passage, ResearchData, Source, Stance } from "./types"

/* -------------------------------------------------------------------------- */
/* 形状                                                                         */
/* -------------------------------------------------------------------------- */

/** 一处用法：某段原文在哪条论断上、以什么身份被使用。 */
export interface PassageUsage {
  linkId: Id
  claimId: Id
  stance: Stance
  /** 停用时间。`null` = 活跃。停用不删除——见 `EvidenceLink.retiredAt`。 */
  retiredAt: IsoTimestamp | null
  /** 引用时写下的理由。 */
  note?: string
}

/** 一段原文，以及它被用在哪里。 */
export interface PassageEntry {
  passage: Passage
  /** **含已停用**。空数组意味着这段原文从未被任何论断引用过。 */
  usages: PassageUsage[]
}

/** 一份材料，以及它在研究里的全部足迹。 */
export interface SourceEntry {
  source: Source
  passages: PassageEntry[]
  /**
   * 这份材料被哪些论断用过（去重）。
   *
   * 去重是重点：一份报告里的三段话**不是**三个论断。用 `Set` 而不是
   * `.length`，是因为「被 3 条论断使用」这句话必须能被核对。
   */
  usedByClaimIds: Id[]
  /** 活跃链接数（停用的不算）。界面上的「N 处引用」用它。 */
  activeUsageCount: number
  /** 一段都没被引用过的片段数。 */
  unusedPassageCount: number
}

/* -------------------------------------------------------------------------- */
/* 组装                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 一段原文的全部用法。
 *
 * 走**历史**投影：一份「曾经被引用、现在没人引用」的片段不是孤儿，
 * 它是被撤回的论述留下的痕迹，而那本身就是信息。
 */
export function usagesForPassage(data: ResearchData, passageId: Id): PassageUsage[] {
  return historicalLinks(data)
    .filter((link) => link.passageId === passageId)
    .map((link) => ({
      linkId: link.id,
      claimId: link.claimId,
      stance: link.stance,
      retiredAt: link.retiredAt,
      note: link.note,
    }))
}

/** 反向：某条论断用到了哪些片段。`citation.roundtrip` 的材料侧视图。 */
export function usagesForClaim(data: ResearchData, claimId: Id): PassageUsage[] {
  return historicalLinks(data)
    .filter((link) => link.claimId === claimId)
    .map((link) => ({
      linkId: link.id,
      claimId: link.claimId,
      stance: link.stance,
      retiredAt: link.retiredAt,
      note: link.note,
    }))
}

/**
 * 整份 Source Index。
 *
 * 顺序是**数据集的顺序**（研究者收集它们的顺序），不排序。
 * 按使用次数排会让这个视图悄悄变成一个排行榜，而它要回答的是
 * 「我手上有什么」——一个仓库问题，不是一个业绩问题。
 */
export function projectSourceIndex(data: ResearchData): SourceEntry[] {
  const active = new Set(activeLinks(data).map((link) => link.id))

  return data.sources.map((source) => {
    const sourcePassages = data.passages.filter((passage) => passage.sourceId === source.id)

    const passages: PassageEntry[] = sourcePassages.map((passage) => ({
      passage,
      usages: usagesForPassage(data, passage.id),
    }))

    const allUsages = passages.flatMap((entry) => entry.usages)

    return {
      source,
      passages,
      usedByClaimIds: [...new Set(allUsages.map((usage) => usage.claimId))],
      activeUsageCount: allUsages.filter((usage) => active.has(usage.linkId)).length,
      unusedPassageCount: passages.filter((entry) => entry.usages.length === 0).length,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* 关联候选                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 一段原文可以被关联到哪条论断，以及**哪些关系已经用过了**。
 *
 * ## 它为什么在这里，而不是在组件里
 *
 * 「这条论断是不是已经有支持了」是一个**领域问题**（它决定那条关系是否会
 * 被 `link/duplicate` 拒绝）。如果组件自己 filter 一遍 links，
 * 就出现了第二份重复判定——而它与守卫分叉的那一天，界面上会出现一个
 * 按下去必然报错的按钮，或者更糟：一个本该被拒绝却看起来可用的按钮。
 */
export interface LinkCandidate {
  claimId: Id
  /** 论断在链条里的序号，从 1 开始。 */
  index: number
  text: string
  /** 这条论断**已经**用过的关系。顺序不保证，调用方按契约排序。 */
  existingStances: Stance[]
}

/**
 * 列出可以承接这段原文的论断。
 *
 * 只列**活跃**论断：被撤回的论断不再参与论证，往它上面挂引用是往一个
 * 已经关掉的文件里归档。它的历史引用仍然完整（见 `usagesForPassage`）。
 */
export function linkCandidatesForPassage(data: ResearchData, passageId: Id): LinkCandidate[] {
  const active = activeLinks(data).filter((link) => link.passageId === passageId)

  return data.claims
    .map((claim, position) => ({ claim, index: position + 1 }))
    .filter(({ claim }) => claim.status !== "retracted")
    .map(({ claim, index }) => ({
      claimId: claim.id,
      index,
      text: claim.text,
      existingStances: active
        .filter((link) => link.claimId === claim.id)
        .map((link) => link.stance),
    }))
}

/* -------------------------------------------------------------------------- */
/* 读法校验                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 检查一段原文的用法是否自洽。返回的问题在测试里断言为空。
 *
 * 它存在的理由和 `validateRelationContract` 一样：让**负例可以被真的跑**。
 * 把一条链接的 stance 改成非法值，这个函数必须能说出话——否则
 * 「stance 必须有语义」这句话只是注释里的一个愿望。
 */
export interface SourceIndexIssue {
  code: string
  message: string
}

export function validateSourceIndex(data: ResearchData): SourceIndexIssue[] {
  const issues: SourceIndexIssue[] = []
  const passageIds = new Set(data.passages.map((passage) => passage.id))
  const claimIds = new Set(data.claims.map((claim) => claim.id))

  for (const link of historicalLinks(data)) {
    if (!passageIds.has(link.passageId)) {
      issues.push({
        code: "source-index/missing-passage",
        message: `链接 ${link.id} 指向不存在的片段 ${link.passageId}`,
      })
    }
    if (!claimIds.has(link.claimId)) {
      issues.push({
        code: "source-index/missing-claim",
        message: `链接 ${link.id} 指向不存在的论断 ${link.claimId}`,
      })
    }
    /* 运行时取值也必须合法 —— 数据库/URL 里可能躺着一个契约还不认识的
       stance，而界面会在渲染它的时候才发现。 */
    if (!isStance(link.stance)) {
      issues.push({
        code: "source-index/invalid-stance",
        message: `链接 ${link.id} 的 stance 不在契约里：${String(link.stance)}`,
      })
    }
  }

  /* 同一 (claim, passage, stance) 在**活跃**集合里不得重复。 */
  const seen = new Map<string, number>()
  for (const link of activeLinks(data)) {
    const key = `${link.claimId}::${link.passageId}::${link.stance}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      issues.push({
        code: "source-index/duplicate-link",
        message: `活跃链接重复 ${count} 次：${key}`,
      })
    }
  }

  return issues
}

/** 一段原文属于哪份材料。用于在用法列表里显示来源名。 */
export function sourceTitleForPassage(data: ResearchData, passageId: Id): string {
  const passage = data.passages.find((candidate) => candidate.id === passageId)
  if (!passage) return ""
  return data.sources.find((source) => source.id === passage.sourceId)?.title ?? ""
}

/** 一条论断的序号（从 1 开始）。找不到时返回 0。 */
export function claimIndexIn(data: ResearchData, claimId: Id): number {
  const claim = getClaim(data, claimId)
  if (!claim) return 0
  return data.claims.findIndex((candidate) => candidate.id === claim.id) + 1
}
