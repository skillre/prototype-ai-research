/**
 * Domain projections —— 所有派生值的**唯一**来源。
 *
 * 硬规则：**同一个计算不能有第二份实现。** UI 层将来读到的每一个数字
 * （引用数、证据强度、依据状态、缺口）都必须来自这里。页面里重新算一次，
 * 就等于开了一个可以漂移的第二事实来源，而且它漂移时不会有任何测试发现。
 *
 * 全部是纯函数：`(data, ...args) => value`。不依赖 React、不依赖时间、不依赖随机。
 */

import type {
  Claim,
  ClaimBasisStatus,
  EvidenceLevel,
  EvidenceLink,
  Finding,
  Id,
  Passage,
  ResearchData,
  Source,
  Stance,
} from "./types"

/* -------------------------------------------------------------------------- */
/* 活跃投影 vs 历史投影                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 活跃的证据链接：当前仍然算数的。
 *
 * 「停用」不等于「删除」。见 `EvidenceLink.retiredAt` 的说明——
 * 研究轨迹的价值就在于「我引用过，后来撤了」，物理删除会把它抹掉。
 */
export function activeLinks(data: ResearchData): EvidenceLink[] {
  return data.links.filter((link) => link.retiredAt === null)
}

/**
 * 历史投影：全部链接，含已停用。
 *
 * 存在的理由是 `deletion.preserves-history` 与 `passage.no-orphan`
 * 这两条不变量都需要问「它**曾经**被引用过吗」——而活跃投影回答不了这个问题。
 */
export function historicalLinks(data: ResearchData): EvidenceLink[] {
  return data.links
}

/** 活跃论断：未被撤回的。注意撤回是状态，不是删除。 */
export function activeClaims(data: ResearchData): Claim[] {
  return data.claims.filter((claim) => claim.status !== "retracted")
}

/** 历史论断：全部，含已撤回。 */
export function historicalClaims(data: ResearchData): Claim[] {
  return data.claims
}

/* -------------------------------------------------------------------------- */
/* 基础查找                                                                     */
/* -------------------------------------------------------------------------- */

export function getClaim(data: ResearchData, claimId: Id): Claim | undefined {
  return data.claims.find((claim) => claim.id === claimId)
}

export function getPassage(data: ResearchData, passageId: Id): Passage | undefined {
  return data.passages.find((passage) => passage.id === passageId)
}

export function getSource(data: ResearchData, sourceId: Id): Source | undefined {
  return data.sources.find((source) => source.id === sourceId)
}

export function getLink(data: ResearchData, linkId: Id): EvidenceLink | undefined {
  return data.links.find((link) => link.id === linkId)
}

/**
 * 一条原文片段属于哪份材料。
 *
 * 返回 `undefined` 表示**数据坏了**（片段指向不存在的来源），不是「没有来源」。
 * 调用方必须把这两种情况分开——`evidence.all-resolvable` 断言的正是前者。
 */
export function getSourceForPassage(data: ResearchData, passageId: Id): Source | undefined {
  const passage = getPassage(data, passageId)
  if (!passage) return undefined
  return getSource(data, passage.sourceId)
}

/* -------------------------------------------------------------------------- */
/* 论断的证据                                                                   */
/* -------------------------------------------------------------------------- */

/** 某条论断在**活跃**投影下的全部证据链接。 */
export function evidenceForClaim(data: ResearchData, claimId: Id): EvidenceLink[] {
  return activeLinks(data).filter((link) => link.claimId === claimId)
}

export function evidenceForClaimByStance(
  data: ResearchData,
  claimId: Id,
  stance: Stance,
): EvidenceLink[] {
  return evidenceForClaim(data, claimId).filter((link) => link.stance === stance)
}

export function supportingEvidenceForClaim(data: ResearchData, claimId: Id): EvidenceLink[] {
  return evidenceForClaimByStance(data, claimId, "supports")
}

export function contradictingEvidenceForClaim(data: ResearchData, claimId: Id): EvidenceLink[] {
  return evidenceForClaimByStance(data, claimId, "contradicts")
}

/**
 * 支撑某条论断的**去重来源**。
 *
 * 去重是重点：同一份报告的三段话**不是**三个来源。把它们算成三个，
 * 是研究里最常见的一种自欺——「我有三处引用」听起来比「我只有一份报告」强得多。
 */
export function distinctSupportingSources(data: ResearchData, claimId: Id): Source[] {
  const seen = new Map<Id, Source>()
  for (const link of supportingEvidenceForClaim(data, claimId)) {
    const source = getSourceForPassage(data, link.passageId)
    if (source && !seen.has(source.id)) seen.set(source.id, source)
  }
  return [...seen.values()]
}

/** 引用某条论断的所有链接数。`includeRetired` 用于核对历史计数。 */
export function citationCount(
  data: ResearchData,
  claimId: Id,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): number {
  const pool = includeRetired ? historicalLinks(data) : activeLinks(data)
  return pool.filter((link) => link.claimId === claimId).length
}

/**
 * 哪些论断引用了这段原文。
 *
 * 默认走**历史**投影：这是双向可追溯性（`citation.roundtrip`）的反方向，
 * 也是 `passage.no-orphan` 需要的视角。一份「曾经被引用、现在没人引用」的
 * 片段不是孤儿——它是被撤回的论述留下的痕迹，那本身就是信息。
 */
export function claimsUsingPassage(
  data: ResearchData,
  passageId: Id,
  { includeRetired = true }: { includeRetired?: boolean } = {},
): Claim[] {
  const pool = includeRetired ? historicalLinks(data) : activeLinks(data)
  const ids = new Set(pool.filter((link) => link.passageId === passageId).map((link) => link.claimId))
  return data.claims.filter((claim) => ids.has(claim.id))
}

/* -------------------------------------------------------------------------- */
/* 派生：依据状态与证据强度                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 一条论断的依据是否还站得住。
 *
 * **`invalidated` 是刻意严格的**：只要引用的来源里有任何一条 `stale` / `missing`，
 * 整条论断的依据就标为失效，即使它还有两个健康来源。
 *
 * 为什么不「打个折」就算了：一个你无法回去核对页码的引用，**在法律上和在
 * 评审会上都不算证据**。静默降级会让这个洞在下一次视觉调整中被忘掉，
 * 而它必须在屏幕上一直挂着直到被修好或明确承认为局限。
 */
export function deriveClaimBasisStatus(data: ResearchData, claimId: Id): ClaimBasisStatus {
  const links = evidenceForClaim(data, claimId)

  const hasUnverifiableSource = links.some((link) => {
    const source = getSourceForPassage(data, link.passageId)
    // 来源根本解析不出来也算失效——它同样不可核对。
    return !source || source.validity !== "ok"
  })
  if (hasUnverifiableSource) return "invalidated"

  const hasSupport = links.some((link) => link.stance === "supports")
  if (!hasSupport) return "unsupported"

  const hasContradiction = links.some((link) => link.stance === "contradicts")
  return hasContradiction ? "contested" : "supported"
}

/**
 * 证据强度阶梯 0–4。**只在 `supports` 上算，且只数可核对的支持。**
 *
 * ```
 * 0  没有任何支持
 * 1  只有三手 / 来源类型不明的支持
 * 2  单一来源支持
 * 3  两个独立来源交叉印证
 * 4  三个及以上独立来源交叉印证
 * ```
 *
 * 三条降级规则，各自对应一个真实的失败模式：
 * - **不可核对的来源不计入支持。** 引用失效 = 没有引用。
 * - **存在反驳时降一级（不低于 1）。** 被挑战过的论断强度确实更低；
 *   但降不到 0——0 的含义是「没有任何支持」，把有争议的结论打成 0 是在撒谎。
 * - **三手来源封顶。** 转述的转述不该和一手材料同权。
 *
 * 返回整数而不是百分比：`73%` 是假精度，「三个独立来源」是一句可以被检查的话。
 */
export function deriveClaimConfidence(data: ResearchData, claimId: Id): EvidenceLevel {
  const verifiableSupports = supportingEvidenceForClaim(data, claimId).filter((link) => {
    const source = getSourceForPassage(data, link.passageId)
    return source !== undefined && source.validity === "ok"
  })
  if (verifiableSupports.length === 0) return 0

  const sources: Source[] = []
  const seen = new Set<Id>()
  for (const link of verifiableSupports) {
    const source = getSourceForPassage(data, link.passageId)
    if (source && !seen.has(source.id)) {
      seen.add(source.id)
      sources.push(source)
    }
  }

  const distinct = sources.length
  let level: number = distinct >= 3 ? 4 : distinct === 2 ? 3 : 2

  const weak = (source: Source) => source.sourceType === "tertiary" || source.sourceType === "unknown"
  if (sources.every(weak)) level = Math.min(level, 1)
  else if (sources.some(weak)) level = Math.min(level, 2)

  if (evidenceForClaimByStance(data, claimId, "contradicts").length > 0) level -= 1

  return Math.max(1, Math.min(4, level)) as EvidenceLevel
}

/**
 * 「未验证」和「已验证」是两个独立的概念。
 *
 * 这个投影存在的唯一理由是 `unverified ≠ verified` 这条不变量。
 *
 * `noContradictionFound` 是一个**弱**陈述：「我没找到反驳」。
 * 它最常见的误用是被当成「该结论成立」——所以它永远不能与 `verified` 合并、
 * 也永远不能单独作为放行依据。一条**根本没有任何证据**的论断同样满足
 * `noContradictionFound`，因为没人去找过。
 *
 * `verified` 需要三件事**同时**成立：有支持、人工确认过、依据未失效。
 */
export interface ClaimVerification {
  hasSupport: boolean
  hasContradiction: boolean
  confirmedByHuman: boolean
  /** 弱陈述：「未发现反驳」。**不等于**已验证。 */
  noContradictionFound: boolean
  /** 强陈述：有支持 + 人工确认 + 依据可核对。 */
  verified: boolean
  basisStatus: ClaimBasisStatus
  confidence: EvidenceLevel
}

export function projectClaimVerification(data: ResearchData, claimId: Id): ClaimVerification {
  const claim = getClaim(data, claimId)
  const links = evidenceForClaim(data, claimId)
  const hasSupport = links.some((link) => link.stance === "supports")
  const hasContradiction = links.some((link) => link.stance === "contradicts")
  const basisStatus = deriveClaimBasisStatus(data, claimId)

  return {
    hasSupport,
    hasContradiction,
    confirmedByHuman: claim?.confirmedByHuman ?? false,
    noContradictionFound: !hasContradiction,
    verified: hasSupport && (claim?.confirmedByHuman ?? false) && basisStatus !== "invalidated",
    basisStatus,
    confidence: deriveClaimConfidence(data, claimId),
  }
}

/* -------------------------------------------------------------------------- */
/* 派生：Finding                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 一条 Finding 的置信度上限：它所引用论断里**最弱**的那一条。
 *
 * 理由：结论的强度不可能高于它最薄弱的环节。允许「其它几条都很强」把
 * 最弱的一环抬起来，正是「哪都还行、哪都不成立」的产生方式——
 * 读者看到的是一句自信的结论，看不到它底下有一条空论断。
 *
 * 返回的是**上限**。`Finding.confidence` 必须 ≤ 它。
 */
export function deriveFindingConfidenceCeiling(data: ResearchData, claimIds: Id[]): EvidenceLevel {
  if (claimIds.length === 0) return 0
  const levels = claimIds.map((claimId) => deriveClaimConfidence(data, claimId))
  return Math.min(...levels) as EvidenceLevel
}

/** Finding 是否满足它自己声明的置信度。违反时返回具体是哪条论断拖低的。 */
export function checkFindingConfidence(
  data: ResearchData,
  finding: Finding,
): { ok: boolean; ceiling: EvidenceLevel; weakestClaimId?: Id } {
  if (finding.claimIds.length === 0) {
    return { ok: finding.confidence === 0, ceiling: 0 }
  }
  const levels = finding.claimIds.map((claimId) => ({
    claimId,
    level: deriveClaimConfidence(data, claimId),
  }))
  const weakest = levels.reduce((min, item) => (item.level < min.level ? item : min))
  return {
    ok: finding.confidence <= weakest.level,
    ceiling: weakest.level,
    weakestClaimId: weakest.claimId,
  }
}

/* -------------------------------------------------------------------------- */
/* 引用完整性                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 一条论断实际引用的原文片段（按链接走，不按任何缓存）。
 *
 * 提供它是为了让 `citation.roundtrip` 可以被真正断言：另一侧是
 * `claimsUsingPassage`（片段 → 论断），两者必须互为逆映射。
 * 只要某一侧偷偷用了缓存字段，这条不变量立刻失败——这正是它的用途。
 */
export function passagesForClaim(
  data: ResearchData,
  claimId: Id,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): Passage[] {
  const pool = includeRetired ? historicalLinks(data) : activeLinks(data)
  return pool
    .filter((link) => link.claimId === claimId)
    .map((link) => getPassage(data, link.passageId))
    .filter((passage): passage is Passage => passage !== undefined)
}

/** 一条证据链接为什么解析不了。 */
export interface UnresolvableEvidence {
  linkId: Id
  claimId: Id
  passageId: Id
  reason: "missing-passage" | "missing-source"
}

/**
 * 找出所有解析不到真实对象的证据链接。
 *
 * 返回空数组 = `evidence.all-resolvable` 成立。
 *
 * 两种失败都算：**片段不存在**，以及**片段存在但它所属的来源不存在**。
 * 第二种容易被漏掉，而它更隐蔽——界面上一切正常，只有在你顺着引用回去
 * 找原文的时候才会发现没有「回去」这个地方。
 */
export function unresolvableEvidence(data: ResearchData): UnresolvableEvidence[] {
  const issues: UnresolvableEvidence[] = []
  for (const link of historicalLinks(data)) {
    const passage = getPassage(data, link.passageId)
    if (!passage) {
      issues.push({
        linkId: link.id,
        claimId: link.claimId,
        passageId: link.passageId,
        reason: "missing-passage",
      })
      continue
    }
    if (!getSource(data, passage.sourceId)) {
      issues.push({
        linkId: link.id,
        claimId: link.claimId,
        passageId: link.passageId,
        reason: "missing-source",
      })
    }
  }
  return issues
}
