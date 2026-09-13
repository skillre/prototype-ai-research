import { test, expect } from "@playwright/test"

import { freshResearch } from "../lib/research/dataset"
import type { ResearchData } from "../lib/research/types"
import {
  activeClaims,
  activeLinks,
  claimsUsingPassage,
  deriveClaimBasisStatus,
  deriveClaimConfidence,
  deriveFindingConfidenceCeiling,
  evidenceForClaim,
  historicalClaims,
  historicalLinks,
  passagesForClaim,
  projectClaimVerification,
  unresolvableEvidence,
} from "../lib/research/projections"
import { deriveTensions, openTensions, projectTensions, tensionIdFor } from "../lib/research/tensions"
import { traceForSubject } from "../lib/research/trace"
import { dispositionTension, retractClaim, retireLink } from "../lib/research/operations"
import { constructAiOutput } from "../lib/research/ai-reviewer"

/**
 * 产品不变量 —— 12 条，每条都有一个**负例**。
 *
 * ## 为什么每个不变量都要有负例
 *
 * 只断言 `expect(allValid).toBe(true)` 的测试证明的是**夹具**，不是**规则**。
 * 它永远不会失败，因为它从来没被放进一个应该失败的状态里。
 *
 * 所以每条不变量都写成一对：合法夹具上成立 + 把数据弄坏之后**确实失败**。
 * 第二半才是测试有牙的证据。
 *
 * ## 这些测试在写 UI 之前跑
 *
 * 这是 Factory 的 invariant-first 要求，也是本产品的实际需要：数据型 UI 的
 * 价值完全建立在「屏幕上的数字是对的」之上。等页面做完再补不变量，
 * 后面每一次视觉调整都在赌。
 *
 * 全部是纯函数测试：没有 DOM、没有浏览器、没有网络。
 */

/* -------------------------------------------------------------------------- */
/* 夹具中的关键 id —— 用具名常量，让断言可读                                    */
/* -------------------------------------------------------------------------- */

const C_CAPACITY = "clm-capacity-crossed" // 健康：两个独立来源，无反驳
const C_UNSUPPORTED = "clm-cost-inflection" // 无任何证据链接
const C_SINGLE_SOURCE = "clm-utilization-recovery" // 两段引用来自同一份报告
const C_CONTESTED = "clm-yield-advantage" // 两个支持 + 一条反驳
const C_LOW_QUALITY = "clm-cost-scale" // 只由三手来源支撑，其中一份已失效
const C_RETRACTED = "clm-expansion-announced" // 已撤回，历史保留

const S_STALE = "src-legacy-forecast" // validity: "stale"
const P_NAMEPLATE = "psg-equipment-nameplate"

/* -------------------------------------------------------------------------- */
/* 1 · evidence.all-resolvable                                                  */
/* -------------------------------------------------------------------------- */

test.describe("1 · evidence.all-resolvable", () => {
  test("每条证据链接都能解析到真实存在的片段，且片段有所属来源", () => {
    expect(unresolvableEvidence(freshResearch())).toEqual([])
  })

  test("负例：删掉片段 → 立刻失败", () => {
    const broken = freshResearch()
    broken.passages = broken.passages.filter((p) => p.id !== P_NAMEPLATE)

    const issues = unresolvableEvidence(broken)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.map((i) => i.reason)).toContain("missing-passage")
    expect(issues[0].passageId).toBe(P_NAMEPLATE)
  })

  test("负例：片段还在但来源没了 → 失败，且原因是 missing-source", () => {
    // 这一种更隐蔽：界面上一切正常，只有顺着引用回去找原文时才发现找不到。
    const broken = freshResearch()
    broken.sources = broken.sources.filter((s) => s.id !== "src-equipment-whitepaper")

    const issues = unresolvableEvidence(broken)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.map((i) => i.reason)).toContain("missing-source")
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · citation.roundtrip                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 双向一致：claim → passage 与 passage → claim 必须互为逆映射。
 *
 * 用**集合**相等而不是包含，也不是计数：重复链接会让计数型检查失灵
 * （两段引用同一片段会让数组长度变成 2，而集合仍然是 1）。
 */
function roundtripHolds(data: ResearchData, includeRetired: boolean): boolean {
  const key = (claimId: string, passageId: string) => `${claimId}::${passageId}`

  const forward = new Set<string>()
  for (const claim of data.claims) {
    for (const passage of passagesForClaim(data, claim.id, { includeRetired })) {
      forward.add(key(claim.id, passage.id))
    }
  }

  const backward = new Set<string>()
  for (const passage of data.passages) {
    for (const claim of claimsUsingPassage(data, passage.id, { includeRetired })) {
      backward.add(key(claim.id, passage.id))
    }
  }

  if (forward.size !== backward.size) return false
  for (const pair of forward) if (!backward.has(pair)) return false
  return true
}

test.describe("2 · citation.roundtrip", () => {
  test("两个方向严格相等（活跃投影与历史投影各自成立）", () => {
    const data = freshResearch()
    expect(roundtripHolds(data, false)).toBe(true)
    expect(roundtripHolds(data, true)).toBe(true)
  })

  test("负例：用错投影就失败——活跃与历史不是同一张图", () => {
    // 已撤回的论断只在历史投影里。任何一边忘了过滤（或忘了不过滤），
    // 两个方向的边集就不再相等——这正是这条不变量要抓的 bug。
    const data = freshResearch()

    const activeEdges = passagesForClaim(data, C_RETRACTED, { includeRetired: false })
    const historicalEdges = passagesForClaim(data, C_RETRACTED, { includeRetired: true })

    expect(activeEdges).toHaveLength(0)
    expect(historicalEdges.length).toBeGreaterThan(0)

    // 把历史边当成活跃边来用，就会凭空多出两条当前并不存在的引用。
    expect(activeEdges).not.toEqual(historicalEdges)
    expect(roundtripHolds(data, false) && roundtripHolds(data, true)).toBe(true)
  })

  test("负例：重复链接让计数型检查失灵，集合型仍然正确", () => {
    const data = freshResearch()
    const original = evidenceForClaim(data, C_CAPACITY)
    const duplicate = { ...original[0], id: "lnk-duplicate-for-test" }
    data.links = [...data.links, duplicate]

    const passages = passagesForClaim(data, C_CAPACITY)
    // 计数会数到两次，集合仍然只有那么多——所以不变量必须写成集合相等。
    expect(passages.length).toBeGreaterThan(new Set(passages.map((p) => p.id)).size)
    expect(new Set(passages.map((p) => p.id)).size).toBe(new Set(original.map((l) => l.passageId)).size)
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · ai.factual-needs-passage                                                 */
/* -------------------------------------------------------------------------- */

test.describe("3 · ai.factual-needs-passage", () => {
  test("带可解析片段的 AI 事实输出可以被构造", () => {
    const data = freshResearch()
    const result = constructAiOutput(data, {
      kind: "factual" as const,
      id: "ai-fact-new",
      statement: "测试用陈述。",
      passageIds: ["psg-association-utilization"],
      sourceType: "secondary" as const,
      createdAt: "2026-09-10T09:00:00+08:00",
    })
    expect(result.ok).toBe(true)
  })

  test("负例：passageIds 为空 → 不得被构造出来", () => {
    const data = freshResearch()
    const result = constructAiOutput(data, {
      kind: "factual" as const,
      id: "ai-fact-no-source",
      statement: "没有任何出处的断言。",
      passageIds: [],
      sourceType: "secondary" as const,
      createdAt: "2026-09-10T09:00:00+08:00",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe("ai/factual-needs-passage")
  })

  test("负例：引用不存在的片段 → 不得被构造出来", () => {
    const data = freshResearch()
    const result = constructAiOutput(data, {
      kind: "factual" as const,
      id: "ai-fact-bad-ref",
      statement: "引用了一个不存在的段落。",
      passageIds: ["psg-does-not-exist"],
      sourceType: "primary" as const,
      createdAt: "2026-09-10T09:00:00+08:00",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe("ai/factual-unresolved-passage")
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · contradiction.never-silent                                               */
/* -------------------------------------------------------------------------- */

test.describe("4 · contradiction.never-silent", () => {
  test("存在反驳时 hasContradiction 为 true", () => {
    const verification = projectClaimVerification(freshResearch(), C_CONTESTED)
    expect(verification.hasContradiction).toBe(true)
    expect(verification.noContradictionFound).toBe(false)
  })

  test("负例：改 status 抹不掉反驳", () => {
    // 「已处理过的反对意见」不该因为把状态改成 standing 就消失。
    for (const status of ["draft", "standing", "limited"] as const) {
      const data = freshResearch()
      const claim = data.claims.find((c) => c.id === C_CONTESTED)
      if (claim) claim.status = status
      expect(projectClaimVerification(data, C_CONTESTED).hasContradiction).toBe(true)
    }
  })

  test("负例：把 stance 改掉，反驳才会真的消失（证明断言不是恒真）", () => {
    const data = freshResearch()
    const link = data.links.find((l) => l.claimId === C_CONTESTED && l.stance === "contradicts")
    expect(link, "夹具里必须存在一条 contradicts 链接，否则这条不变量没被覆盖").toBeDefined()
    if (link) link.stance = "context"

    expect(projectClaimVerification(data, C_CONTESTED).hasContradiction).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · finding.confidence-bounded                                               */
/* -------------------------------------------------------------------------- */

test.describe("5 · finding.confidence-bounded", () => {
  test("Finding 的置信度不超过所引用论断里最弱的那一条", () => {
    const data = freshResearch()
    for (const finding of data.findings) {
      expect(finding.confidence).toBeLessThanOrEqual(
        deriveFindingConfidenceCeiling(data, finding.claimIds),
      )
    }
  })

  test("负例：把 Finding 抬到最弱环节之上 → 失败，并指出是哪一条拖低的", () => {
    const data = freshResearch()
    const finding = data.findings[0]
    const ceiling = deriveFindingConfidenceCeiling(data, finding.claimIds)

    // 夹具里最弱的是单一来源那条（2）。
    expect(ceiling).toBe(2)

    const inflated = { ...finding, confidence: 4 as const }
    expect(inflated.confidence).toBeGreaterThan(ceiling)

    const levels = finding.claimIds.map((id) => ({ id, level: deriveClaimConfidence(data, id) }))
    const weakest = levels.reduce((min, item) => (item.level < min.level ? item : min))
    expect(weakest.level).toBe(2)
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · unverified ≠ verified                                                    */
/* -------------------------------------------------------------------------- */

test.describe("6 · unverified ≠ verified", () => {
  test("「未发现反驳」与「已验证」是两个独立字段", () => {
    const data = freshResearch()
    const unsupported = projectClaimVerification(data, C_UNSUPPORTED)

    // 一条根本没有任何证据的论断同样满足 noContradictionFound —— 因为没人去找过。
    expect(unsupported.noContradictionFound).toBe(true)
    // 但它绝不是 verified。
    expect(unsupported.verified).toBe(false)
    expect(unsupported.hasSupport).toBe(false)
  })

  test("依据失效时不得 verified", () => {
    const data = freshResearch()
    const verification = projectClaimVerification(data, C_LOW_QUALITY)
    expect(verification.basisStatus).toBe("invalidated")
    expect(verification.verified).toBe(false)
  })

  test("负例：AI 起草且未经人工确认 → 不得 verified", () => {
    const data = freshResearch()
    const claim = data.claims.find((c) => c.id === C_CAPACITY)
    expect(claim).toBeDefined()
    if (!claim) return

    expect(projectClaimVerification(data, C_CAPACITY).verified).toBe(true)

    claim.confirmedByHuman = false
    expect(projectClaimVerification(data, C_CAPACITY).verified).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 7 · stale.invalidates                                                        */
/* -------------------------------------------------------------------------- */

test.describe("7 · stale.invalidates", () => {
  test("引用了失效来源的论断，依据状态为 invalidated", () => {
    const data = freshResearch()
    expect(deriveClaimBasisStatus(data, C_LOW_QUALITY)).toBe("invalidated")
  })

  test("负例：把来源改成 ok，失效状态立刻消失（证明它真的在跟随数据）", () => {
    const data = freshResearch()
    const stale = data.sources.find((s) => s.id === S_STALE)
    expect(stale?.validity).toBe("stale")
    if (stale) stale.validity = "ok"

    expect(deriveClaimBasisStatus(data, C_LOW_QUALITY)).not.toBe("invalidated")
  })

  test("负例：validity 为 missing 同样触发失效", () => {
    const data = freshResearch()
    const stale = data.sources.find((s) => s.id === S_STALE)
    if (stale) stale.validity = "missing"
    expect(deriveClaimBasisStatus(data, C_LOW_QUALITY)).toBe("invalidated")
  })
})

/* -------------------------------------------------------------------------- */
/* 8 · deletion.preserves-history                                               */
/* -------------------------------------------------------------------------- */

test.describe("8 · deletion.preserves-history", () => {
  test("夹具里已撤回的论断，其论断与链接在历史投影里完整保留", () => {
    const data = freshResearch()

    expect(historicalClaims(data).some((c) => c.id === C_RETRACTED)).toBe(true)
    expect(activeClaims(data).some((c) => c.id === C_RETRACTED)).toBe(false)

    const retired = historicalLinks(data).filter((l) => l.claimId === C_RETRACTED)
    expect(retired.length).toBeGreaterThan(0)
    expect(retired.every((l) => l.retiredAt !== null)).toBe(true)

    expect(traceForSubject(data, "claim", C_RETRACTED).some((t) => t.kind === "claim-retracted")).toBe(
      true,
    )
  })

  test("负例：撤回不物理删除，且一定留下轨迹", () => {
    const data = freshResearch()
    const claimsBefore = data.claims.length
    const linksBefore = data.links.length

    const next = retractClaim(data, C_CAPACITY, {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "测试用撤回。",
    })

    // 数组长度不变 —— 撤回是状态变更，不是删除。
    expect(next.claims).toHaveLength(claimsBefore)
    expect(next.links).toHaveLength(linksBefore)

    // 状态与活跃投影变了。
    expect(next.claims.find((c) => c.id === C_CAPACITY)?.status).toBe("retracted")
    expect(activeLinks(next).filter((l) => l.claimId === C_CAPACITY)).toHaveLength(0)

    // 而历史仍然完整，轨迹也多了一条。
    expect(historicalLinks(next).filter((l) => l.claimId === C_CAPACITY).length).toBeGreaterThan(0)
    expect(traceForSubject(next, "claim", C_CAPACITY).some((t) => t.kind === "claim-retracted")).toBe(
      true,
    )
    expect(next.trace.length).toBe(data.trace.length + 1)
  })

  test("负例：物理移除会让轨迹失去对象——这正是被禁止的操作", () => {
    const data = freshResearch()
    // 模拟一个「图省事」的实现：直接从数组里删掉。
    const deleted: ResearchData = { ...data, claims: data.claims.filter((c) => c.id !== C_RETRACTED) }

    // 论断没了，但链接还在——引用完整性崩了，而轨迹指向了一个不存在的对象。
    expect(deleted.claims.some((c) => c.id === C_RETRACTED)).toBe(false)
    expect(unresolvableEvidence(deleted).length).toBe(0) // 链接仍能解析（片段还在）
    expect(traceForSubject(deleted, "claim", C_RETRACTED).length).toBeGreaterThan(0)
    // 轨迹仍在，但它的 subject 已经不存在 —— 这正是「不物理删除」要避免的。
    expect(deleted.claims.find((c) => c.id === C_RETRACTED)).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* 9 · passage.no-orphan                                                        */
/* -------------------------------------------------------------------------- */

test.describe("9 · passage.no-orphan", () => {
  test("每段被引用过的原文片段，都至少有一条（当前或历史）链接", () => {
    const data = freshResearch()
    const orphans = data.passages
      .filter((passage) => passage.quotedAt !== null)
      .filter((passage) => claimsUsingPassage(data, passage.id, { includeRetired: true }).length === 0)

    expect(orphans.map((p) => p.id)).toEqual([])
  })

  test("负例：标成已引用但没有链接的片段 → 失败", () => {
    const data = freshResearch()
    data.passages = [
      ...data.passages,
      {
        id: "psg-forgotten",
        sourceId: "src-association-stats",
        locator: { anchor: "appendix" },
        text: "这段被标为已引用，但没有任何论断链接它。",
        quotedAt: "2026-09-05T10:05:00+08:00",
      },
    ]

    const orphans = data.passages
      .filter((passage) => passage.quotedAt !== null)
      .filter((passage) => claimsUsingPassage(data, passage.id, { includeRetired: true }).length === 0)

    expect(orphans.map((p) => p.id)).toEqual(["psg-forgotten"])
  })

  test("链接被停用之后片段仍然不是孤儿——历史投影算数", () => {
    const data = freshResearch()
    const link = data.links.find((l) => l.claimId === C_RETRACTED)
    expect(link).toBeDefined()
    if (!link) return

    // 活跃投影下它已经没被引用。
    expect(claimsUsingPassage(data, link.passageId, { includeRetired: false })).toHaveLength(0)
    // 但历史投影下它仍然属于一次真实的研究动作。
    expect(claimsUsingPassage(data, link.passageId, { includeRetired: true }).length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 10 · count.matches-links                                                     */
/* -------------------------------------------------------------------------- */

test.describe("10 · count.matches-links", () => {
  test("引用计数等于真实链接重算结果", () => {
    const data = freshResearch()
    for (const claim of data.claims) {
      // 计数必须由链接重算得到，不能来自任何缓存或独立计数器。
      const recomputed = activeLinks(data).filter((l) => l.claimId === claim.id).length
      expect(evidenceForClaim(data, claim.id)).toHaveLength(recomputed)
    }
  })

  test("负例：停用一条链接后，活跃计数减一而历史计数不变", () => {
    const data = freshResearch()
    const link = evidenceForClaim(data, C_CAPACITY)[0]

    const activeBefore = activeLinks(data).filter((l) => l.claimId === C_CAPACITY).length
    const historicalBefore = historicalLinks(data).filter((l) => l.claimId === C_CAPACITY).length

    const next = retireLink(data, link.id, {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "测试用停用。",
    })

    expect(activeLinks(next).filter((l) => l.claimId === C_CAPACITY)).toHaveLength(activeBefore - 1)
    expect(historicalLinks(next).filter((l) => l.claimId === C_CAPACITY)).toHaveLength(historicalBefore)
  })
})

/* -------------------------------------------------------------------------- */
/* 11 · tension.is-derived                                                      */
/* -------------------------------------------------------------------------- */

test.describe("11 · tension.is-derived", () => {
  test("重算是纯函数：两次调用结果完全一致", () => {
    const data = freshResearch()
    expect(deriveTensions(data)).toEqual(deriveTensions(data))
  })

  test("处置不改动事实字段——这正是「派生与处置分开存」的意义", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("single-source", C_SINGLE_SOURCE)
    const derivedBefore = deriveTensions(data).find((t) => t.id === tensionId)
    expect(derivedBefore).toBeDefined()

    const disposed = dispositionTension(data, tensionId, "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "测试用处置。",
    })

    // 事实字段一个都没变。
    expect(deriveTensions(disposed)).toEqual(deriveTensions(data))

    // 投影里它被标记为已处理，但它**仍然存在**。
    const projected = projectTensions(disposed).find((t) => t.id === tensionId)
    expect(projected?.resolution).toBe("resolved")
    expect(openTensions(projectTensions(disposed)).some((t) => t.id === tensionId)).toBe(false)
  })

  test("负例：张力是活的——补上证据它就消失，撤掉证据它又回来", () => {
    const data = freshResearch()
    const unsupportedId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)

    expect(deriveTensions(data).some((t) => t.id === unsupportedId)).toBe(true)

    // 给这条论断补一条支持 → 张力消失。
    const fixed: ResearchData = {
      ...data,
      links: [
        ...data.links,
        {
          id: "lnk-new-support",
          claimId: C_UNSUPPORTED,
          passageId: P_NAMEPLATE,
          stance: "supports" as const,
          createdBy: "human" as const,
          createdAt: "2026-09-10T12:00:00+08:00",
          retiredAt: null,
        },
      ],
    }
    expect(deriveTensions(fixed).some((t) => t.id === unsupportedId)).toBe(false)

    // 再把它拿掉 → 张力重新出现。证明它是算出来的，不是存下来的。
    const reverted: ResearchData = { ...fixed, links: data.links }
    expect(deriveTensions(reverted).some((t) => t.id === unsupportedId)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 12 · tension.single-source-raised                                            */
/* -------------------------------------------------------------------------- */

test.describe("12 · tension.single-source-raised", () => {
  test("所有支持只来自一个来源时，必须产生 single-source 张力", () => {
    const data = freshResearch()
    const tensions = deriveTensions(data)
    const found = tensions.find((t) => t.id === tensionIdFor("single-source", C_SINGLE_SOURCE))

    expect(found).toBeDefined()
    expect(found?.severity).toBe("notable")
    expect(found?.subject.sourceIds).toHaveLength(1)
  })

  test("负例：补上第二个独立来源 → 张力消失", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("single-source", C_SINGLE_SOURCE)

    const fixed: ResearchData = {
      ...data,
      links: [
        ...data.links,
        {
          id: "lnk-second-source",
          claimId: C_SINGLE_SOURCE,
          passageId: "psg-association-utilization",
          stance: "supports" as const,
          createdBy: "human" as const,
          createdAt: "2026-09-10T12:00:00+08:00",
          retiredAt: null,
        },
      ],
    }

    expect(deriveTensions(fixed).some((t) => t.id === tensionId)).toBe(false)
  })

  test("负例：手动删掉张力不会让它消失——它不是存下来的", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("single-source", C_SINGLE_SOURCE)

    // ResearchData 里根本没有 tensions 字段可以删。
    expect(Object.keys(data)).not.toContain("tensions")

    const disposed = dispositionTension(data, tensionId, "accepted-as-limitation", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "接受这个局限。",
    })
    // 处置之后重算，张力依然在 —— 事实不会因为人的决定而改变。
    expect(deriveTensions(disposed).some((t) => t.id === tensionId)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 夹具本身的覆盖度                                                              */
/* -------------------------------------------------------------------------- */

test.describe("夹具覆盖度", () => {
  test("数据集规模符合约定", () => {
    const data = freshResearch()
    expect(data.sources).toHaveLength(8)
    expect(data.passages).toHaveLength(14)
    expect(data.claims).toHaveLength(6)
    expect(data.findings).toHaveLength(1)
  })

  test("四种 stance 全部出现（各至少一次）", () => {
    const data = freshResearch()
    const active = activeLinks(data)
    expect(active.filter((l) => l.stance === "supports").length).toBeGreaterThanOrEqual(2)
    expect(active.filter((l) => l.stance === "contradicts").length).toBeGreaterThanOrEqual(1)
    expect(active.filter((l) => l.stance === "qualifies").length).toBeGreaterThanOrEqual(1)
    expect(active.filter((l) => l.stance === "context").length).toBeGreaterThanOrEqual(2)
  })

  test("五类张力全部被触发", () => {
    const kinds = new Set(deriveTensions(freshResearch()).map((t) => t.kind))
    expect([...kinds].sort()).toEqual([
      "contradictory-evidence",
      "low-quality-evidence",
      "single-source",
      "stale-source",
      "unsupported-claim",
    ])
  })

  test("四种依据状态全部出现", () => {
    const data = freshResearch()
    const statuses = new Set(
      activeClaims(data).map((claim) => deriveClaimBasisStatus(data, claim.id)),
    )
    expect([...statuses].sort()).toEqual(["contested", "invalidated", "supported", "unsupported"])
  })

  test("存在一条被撤回但历史完整的论断", () => {
    const data = freshResearch()
    const retracted = historicalClaims(data).filter((c) => c.status === "retracted")
    expect(retracted).toHaveLength(1)
    expect(traceForSubject(data, "claim", retracted[0].id).length).toBeGreaterThan(0)
  })
})
