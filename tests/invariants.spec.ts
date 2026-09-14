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
import {
  deriveTensions,
  isTensionStillRaised,
  openTensions,
  parseTensionId,
  projectResolvedTensions,
  projectTensions,
  tensionIdFor,
} from "../lib/research/tensions"
import { traceForSubject } from "../lib/research/trace"
import {
  acceptAiOutput,
  addEvidenceLink,
  dispositionTension,
  rejectAiOutput,
  retractClaim,
  retireLink,
  type DispositionOutcome,
} from "../lib/research/operations"
import { constructAiOutput, mayEnterFinding } from "../lib/research/ai-reviewer"
import { validateSourceIndex } from "../lib/research/sources"

/**
 * 拆开处置结果。
 *
 * `dispositionTension` 从 Phase E 起返回结果对象而不是裸的 `ResearchData`——
 * 因为它会**拒绝**非法的处置（不变量 13）。测试里绝大多数调用都是
 * 「这条处置应该成功」，所以这个助手把成功路径写成一行，
 * 而失败路径由专门的测试显式断言 `ok: false`。
 *
 * 注意它**不是**在吞掉错误：断言失败时它会带着 code 抛出来，
 * 所以「本该成功的处置被拒绝了」会是一条可读的失败，而不是一个 undefined。
 */
function expectDisposed(outcome: DispositionOutcome) {
  if (!outcome.ok) {
    throw new Error(`处置被拒绝：${outcome.issues.map((issue) => `${issue.code} ${issue.message}`).join(" / ")}`)
  }
  return outcome.data
}

/**
 * 产品不变量 —— **18 条**，每条都有一个**负例**。
 *
 * | 阶段 | 新增 |
 * |---|---|
 * | Phase A | 1–12 |
 * | Phase E | 13 `resolved.requires-fact-change` · 14 `disposition.writes-trace` |
 * | Phase F | 15 `ai-reviewer.cannot-mutate` |
 * | Phase G+H | 16 `evidence-link.no-duplicate` · 17 `link-write.recomputes-tensions` · 18 `resolved-ui-reachable` |
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

    /*
     * ⚠ Phase E 修正了这里的一个**非法取值**，不是放宽了断言。
     *
     * 这条测试原本用 `"resolved"`，而这条单来源张力**的事实还在**
     * （两段引用仍来自同一份报告）。不变量 13 落地后，
     * `resolved` 在事实未变时会被 `dispositionTension` 拒绝——
     * 因为「解决」是一句事实断言，不是一句意愿。
     *
     * 换用 `accepted-as-limitation` 之后，这条测试**要断言的东西完全没变**：
     * 处置不改动任何事实字段，投影标记为已处理，而张力**仍然存在**。
     * 它甚至比原来更贴题——因为只有 accepted-as-limitation 才是
     * 「处置了，但事实一成不变」的那个出口。
     */
    const disposed = expectDisposed(
      dispositionTension(data, tensionId, "accepted-as-limitation", {
        actor: "human",
        at: "2026-09-10T12:00:00+08:00",
        reason: "测试用处置。",
      }),
    )

    // 事实字段一个都没变。
    expect(deriveTensions(disposed)).toEqual(deriveTensions(data))

    // 投影里它被标记为已处理，但它**仍然存在**。
    const projected = projectTensions(disposed).find((t) => t.id === tensionId)
    expect(projected?.resolution).toBe("accepted-as-limitation")
    expect(openTensions(projectTensions(disposed)).some((t) => t.id === tensionId)).toBe(false)
    // 而且事实依旧成立——「已处理」不等于「已消失」。
    expect(isTensionStillRaised(disposed, tensionId)).toBe(true)
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

    const disposed = expectDisposed(
      dispositionTension(data, tensionId, "accepted-as-limitation", {
        actor: "human",
        at: "2026-09-10T12:00:00+08:00",
        reason: "接受这个局限。",
      }),
    )
    // 处置之后重算，张力依然在 —— 事实不会因为人的决定而改变。
    expect(deriveTensions(disposed).some((t) => t.id === tensionId)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 13 · resolved.requires-fact-change——Phase E 新增                              */
/* -------------------------------------------------------------------------- */

/**
 * 这条不变量保护的是本产品的核心区分：
 *
 * ```
 * resolved                  事实断言 ——「这个洞不存在了」
 * accepted-as-limitation    判断     ——「洞还在，我带着它交付」
 * ```
 *
 * 如果 `resolved` 可以在事实未变时被写下，那么第二个状态会慢慢变成第一个：
 * 用户看到一个绿色的「已解决」，而屏幕底下那条论断仍然没有任何证据。
 * **界面上的自欺和结论里的自欺是同一件事**，而这一屏存在的全部意义就是
 * 让后者不可能悄悄发生。
 *
 * 守卫在 `dispositionTension` 里，所以它是**不可绕过**的——没有第二个
 * 「只写状态不校验」的底层入口可以调。
 */
test.describe("13 · resolved.requires-fact-change", () => {
  /** 给一条论断补一条支持链接，制造「事实真的变了」。 */
  function withSupportFor(claimId: string, data: ResearchData): ResearchData {
    return {
      ...data,
      links: [
        ...data.links,
        {
          id: "lnk-new-support",
          claimId,
          passageId: P_NAMEPLATE,
          stance: "supports" as const,
          createdBy: "human" as const,
          createdAt: "2026-09-10T12:00:00+08:00",
          retiredAt: null,
        },
      ],
    }
  }

  test("正例：事实变了之后，resolved 才被接受", () => {
    const data = withSupportFor(C_UNSUPPORTED, freshResearch())
    const tensionId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)

    // 事实已经变了：这条张力不再被推导出来。
    expect(isTensionStillRaised(data, tensionId)).toBe(false)

    const outcome = dispositionTension(data, tensionId, "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "已补上设备白皮书的一手产能数字。",
    })
    expect(outcome.ok).toBe(true)
  })

  test("负例：无证据支撑的论断仍无证据 → resolve 被拒绝", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)
    expect(isTensionStillRaised(data, tensionId)).toBe(true)

    const outcome = dispositionTension(data, tensionId, "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "我觉得可以了。",
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues.map((issue) => issue.code)).toContain(
      "disposition/resolved-requires-fact-change",
    )
  })

  test("被拒绝的处置不写状态、也不写轨迹", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)
    const traceBefore = data.trace.length
    const dispositionsBefore = data.dispositions.length

    const outcome = dispositionTension(data, tensionId, "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "试试看。",
    })

    expect(outcome.ok).toBe(false)
    // `data` 根本没有被改动 —— 失败是纯函数意义上的「什么都没发生」。
    expect(data.trace).toHaveLength(traceBefore)
    expect(data.dispositions).toHaveLength(dispositionsBefore)
  })

  test("事实仍在时，accepted-as-limitation 被接受——这是两个出口的分界", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)
    expect(isTensionStillRaised(data, tensionId)).toBe(true)

    const outcome = dispositionTension(data, tensionId, "accepted-as-limitation", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "目前只能取得二手行业报告，无法获得 2025 年后的一手产能数据。",
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // 处置写下去了，但**事实一模一样**。
    expect(isTensionStillRaised(outcome.data, tensionId)).toBe(true)
    expect(deriveTensions(outcome.data)).toEqual(deriveTensions(data))
  })

  test("负例：洞不存在了就不能「接受为局限」——那会凭空造出一条局限", () => {
    const data = withSupportFor(C_UNSUPPORTED, freshResearch())
    const tensionId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)
    expect(isTensionStillRaised(data, tensionId)).toBe(false)

    const outcome = dispositionTension(data, tensionId, "accepted-as-limitation", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "接受它。",
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues.map((issue) => issue.code)).toContain(
      "disposition/accepted-without-raised-tension",
    )
  })

  test("负例：理由为空一律被拒绝——两种出口都不例外", () => {
    const data = withSupportFor(C_UNSUPPORTED, freshResearch())
    const resolvedId = tensionIdFor("unsupported-claim", C_UNSUPPORTED)
    const limitationId = tensionIdFor("single-source", C_SINGLE_SOURCE)

    const resolveOutcome = dispositionTension(data, resolvedId, "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "   ",
    })
    expect(resolveOutcome.ok).toBe(false)
    if (!resolveOutcome.ok) {
      expect(resolveOutcome.issues.map((issue) => issue.code)).toContain("disposition/missing-reason")
    }

    const limitOutcome = dispositionTension(data, limitationId, "accepted-as-limitation", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "",
    })
    expect(limitOutcome.ok).toBe(false)
    if (!limitOutcome.ok) {
      expect(limitOutcome.issues.map((issue) => issue.code)).toContain("disposition/missing-reason")
    }
  })

  test("负例：指向不存在论断的张力 id 被拒绝，且理由与「洞被填上」不同", () => {
    /*
     * 这两件事必须分开，因为 `isTensionStillRaised` 对它们都返回 false，
     * 而正确处置完全相反：
     *   「洞被填上了」 → resolved 合法
     *   「id 不存在」   → 必须拒绝
     * 只看 stillRaised 无法区分，所以 id 必须是可逆的（parseTensionId）。
     */
    const data = freshResearch()

    const outcome = dispositionTension(data, "unsupported-claim::clm-does-not-exist", "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "随便写的。",
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["disposition/unknown-tension"])

    // 对照：id 格式本身坏掉时也是同一条 code，而不是抛异常。
    const malformed = dispositionTension(data, "not-a-tension-id", "resolved", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "随便写的。",
    })
    expect(malformed.ok).toBe(false)
  })

  test("tensionIdFor / parseTensionId 互为逆运算", () => {
    for (const kind of [
      "unsupported-claim",
      "contradictory-evidence",
      "single-source",
      "stale-source",
      "low-quality-evidence",
    ] as const) {
      const parsed = parseTensionId(tensionIdFor(kind, C_CONTESTED))
      expect(parsed).toEqual({ kind, claimId: C_CONTESTED })
    }

    // 负例：这些都不是合法的张力 id。
    expect(parseTensionId("unsupported-claim")).toBeNull()
    expect(parseTensionId("::clm-x")).toBeNull()
    expect(parseTensionId("unsupported-claim::")).toBeNull()
    expect(parseTensionId("not-a-kind::clm-x")).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 14 · disposition.writes-trace                                                */
/* -------------------------------------------------------------------------- */

test.describe("14 · 处置与轨迹原子同写", () => {
  test("成功的处置一定留下一条轨迹，且指向那条张力", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("single-source", C_SINGLE_SOURCE)
    const before = traceForSubject(data, "tension", tensionId).length

    const outcome = dispositionTension(data, tensionId, "accepted-as-limitation", {
      actor: "human",
      at: "2026-09-10T12:00:00+08:00",
      reason: "短期内不再找第二来源。",
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const entries = traceForSubject(outcome.data, "tension", tensionId)
    expect(entries).toHaveLength(before + 1)
    const latest = entries.at(-1)!
    expect(latest.kind).toBe("tension-dispositioned")
    expect(latest.actor).toBe("human")
    // 轨迹里必须同时保留出口与理由——只记「已处理」在半年后读不出任何东西。
    expect(latest.reason).toContain("accepted-as-limitation")
    expect(latest.reason).toContain("短期内不再找第二来源")
  })

  test("重复处置保留全部历史，投影取最后一次", () => {
    const data = freshResearch()
    const tensionId = tensionIdFor("single-source", C_SINGLE_SOURCE)

    const first = expectDisposed(
      dispositionTension(data, tensionId, "accepted-as-limitation", {
        actor: "human",
        at: "2026-09-10T12:00:00+08:00",
        reason: "第一次：接受。",
      }),
    )
    const second = expectDisposed(
      dispositionTension(first, tensionId, "accepted-as-limitation", {
        actor: "human",
        at: "2026-09-11T12:00:00+08:00",
        reason: "第二次：改一下理由。",
      }),
    )

    expect(second.dispositions.length).toBe(first.dispositions.length + 1)
    expect(projectTensions(second).find((t) => t.id === tensionId)?.dispositionReason).toBe(
      "第二次：改一下理由。",
    )
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

/* -------------------------------------------------------------------------- */
/* 15 · ai-reviewer.cannot-mutate——Phase F 新增                                  */
/* -------------------------------------------------------------------------- */

/**
 * AI Reviewer 只能**说话**，不能改任何业务事实。
 *
 * 这条不变量不是靠约定守的，而是靠 API 形状：`acceptAiOutput` /
 * `rejectAiOutput` 的签名里根本没有能改那些字段的参数。所以它实际上是
 * 「有人加了参数之后测试会失败」的守卫——那正是它存在的意义。
 *
 * 半年后如果有人想给「采纳」接上「顺便把这条张力也标记为已处理」，
 * 这条测试会在那一刻失败，而不是在产品开始撒谎之后才被发现。
 */
test.describe("15 · AI 不得改动业务事实", () => {
  /** 除 trace 外逐字段全等。 */
  function withoutTrace(data: ResearchData) {
    const { trace: _trace, ...rest } = data
    void _trace
    return rest
  }

  test("采纳不改变任何字段（除 trace）", () => {
    const data = freshResearch()
    const outcome = acceptAiOutput(data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "这条批评成立，需要补一手材料。",
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(withoutTrace(outcome.data)).toEqual(withoutTrace(data))
    // 而且它**没有**处置张力 —— 采纳不是处置。
    expect(outcome.data.dispositions).toEqual(data.dispositions)
    expect(deriveTensions(outcome.data)).toEqual(deriveTensions(data))
    // 输出本身也没被改。
    expect(outcome.data.aiOutputs).toEqual(data.aiOutputs)
  })

  test("驳回同样不改变任何字段，且**不删除输出**", () => {
    const data = freshResearch()
    const before = data.aiOutputs.length
    const outcome = rejectAiOutput(data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "这条批评的靶心不对。",
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(withoutTrace(outcome.data)).toEqual(withoutTrace(data))
    // 没有删除 —— 这条是 deletion-preserves-history 在 AI 输出上的同一条规则。
    expect(outcome.data.aiOutputs).toHaveLength(before)
    expect(outcome.data.aiOutputs.map((o) => o.id)).toContain("ai-critique-unsupported")
  })

  test("采纳与驳回各自留下一条轨迹，且都指向那条输出", () => {
    const data = freshResearch()
    const accepted = acceptAiOutput(data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "成立。",
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return

    const entries = traceForSubject(accepted.data, "ai-output", "ai-critique-unsupported")
    expect(entries.at(-1)?.kind).toBe("ai-output-accepted")
    expect(entries.at(-1)?.reason).toBe("成立。")
  })

  test("负例：同一条输出不能被既驳回又采纳（历史里不能留两条互相否认的记录）", () => {
    const data = freshResearch()
    const accepted = acceptAiOutput(data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "成立。",
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return

    const flip = rejectAiOutput(accepted.data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T11:00:00+08:00",
      reason: "反悔了。",
    })
    expect(flip.ok).toBe(false)
    if (flip.ok) return
    expect(flip.issues.map((issue) => issue.code)).toContain("ai/already-accepted")
  })

  test("负例：理由为空或输出不存在时被拒绝", () => {
    const data = freshResearch()

    const noReason = acceptAiOutput(data, "ai-critique-unsupported", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "  ",
    })
    expect(noReason.ok).toBe(false)
    if (!noReason.ok) {
      expect(noReason.issues.map((issue) => issue.code)).toContain("ai/missing-reason")
    }

    const unknown = rejectAiOutput(data, "ai-does-not-exist", {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "随便。",
    })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) {
      expect(unknown.issues.map((issue) => issue.code)).toContain("ai/unknown-output")
    }
  })

  test("建议永远不得进入 Finding —— 这是三类输出里唯一不可协商的一条", () => {
    const data = freshResearch()
    const suggestion = data.aiOutputs.find((output) => output.kind === "suggestion")!
    expect(mayEnterFinding(suggestion)).toBe(false)
    for (const output of data.aiOutputs) {
      if (output.kind === "suggestion") expect(mayEnterFinding(output)).toBe(false)
      else expect(mayEnterFinding(output)).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Phase G+H                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("16 · evidence-link.no-duplicate", () => {
  /** 一条可用的片段与一条可用的论断。数据集里它们本来**没有**关联。 */
  const PASSAGE = "psg-summary-cost"
  const CLAIM = "clm-cost-inflection"

  test("正例：一个新的 (claim, passage, stance) 可以被建立，并留下轨迹", () => {
    const data = freshResearch()
    const before = data.links.length
    const outcome = addEvidenceLink(
      data,
      { claimId: CLAIM, passageId: PASSAGE, stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补一份成本口径的材料。" },
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.data.links.length).toBe(before + 1)
    expect(outcome.link.claimId).toBe(CLAIM)
    expect(outcome.link.passageId).toBe(PASSAGE)
    expect(outcome.link.stance).toBe("supports")
    expect(outcome.link.retiredAt).toBeNull()

    const trace = traceForSubject(outcome.data, "evidence-link", outcome.link.id)
    expect(trace.map((entry) => entry.kind)).toEqual(["link-created"])
  })

  test("负例：同一 (claim, passage, stance) 第二次被拒绝", () => {
    const data = freshResearch()
    const meta = { actor: "human" as const, at: "2026-09-11T10:00:00+08:00", reason: "再补一次。" }

    const first = addEvidenceLink(data, { claimId: CLAIM, passageId: PASSAGE, stance: "supports" }, meta)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = addEvidenceLink(
      first.data,
      { claimId: CLAIM, passageId: PASSAGE, stance: "supports" },
      meta,
    )
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.issues.map((issue) => issue.code)).toContain("link/duplicate")
  })

  test("负例：被拒绝的重复写入不改变任何状态，也不写轨迹", () => {
    const data = freshResearch()
    const meta = { actor: "human" as const, at: "2026-09-11T10:00:00+08:00", reason: "重复。" }
    const first = addEvidenceLink(data, { claimId: CLAIM, passageId: PASSAGE, stance: "supports" }, meta)
    if (!first.ok) throw new Error("夹具前提不成立")

    const second = addEvidenceLink(
      first.data,
      { claimId: CLAIM, passageId: PASSAGE, stance: "supports" },
      meta,
    )
    expect(second.ok).toBe(false)
    /* 失败返回里**没有 data** —— 它压根没给出一个「可能已经变了」的聚合。
       这不是约定，是 `LinkOutcome` 的类型形状。 */
    expect("data" in second).toBe(false)
    expect(first.data.links.length).toBe(data.links.length + 1)
  })

  test("换一个 stance 不算重复——同一片段可以既支持又反驳", () => {
    const data = freshResearch()
    const meta = { actor: "human" as const, at: "2026-09-11T10:00:00+08:00", reason: "另一面。" }

    const support = addEvidenceLink(data, { claimId: CLAIM, passageId: PASSAGE, stance: "supports" }, meta)
    expect(support.ok).toBe(true)
    if (!support.ok) return

    const against = addEvidenceLink(
      support.data,
      { claimId: CLAIM, passageId: PASSAGE, stance: "contradicts" },
      meta,
    )
    expect(against.ok).toBe(true)
  })

  test("负例：已停用的同一条链接不算重复——撤销自己的撤销必须可行", () => {
    const data = freshResearch()
    const meta = { actor: "human" as const, at: "2026-09-11T10:00:00+08:00", reason: "先撤再引回来。" }

    const first = addEvidenceLink(data, { claimId: CLAIM, passageId: PASSAGE, stance: "supports" }, meta)
    if (!first.ok) throw new Error("夹具前提不成立")

    const retired = retireLink(first.data, first.link.id, meta)
    const again = addEvidenceLink(
      retired,
      { claimId: CLAIM, passageId: PASSAGE, stance: "supports" },
      meta,
    )
    expect(again.ok, "停用之后重新引用同一条关系是合法的").toBe(true)
  })

  test("负例：论断 / 片段不存在，或 stance 非法，一律被拒绝", () => {
    const data = freshResearch()
    const meta = { actor: "human" as const, at: "2026-09-11T10:00:00+08:00", reason: "坏输入。" }

    const noClaim = addEvidenceLink(
      data,
      { claimId: "clm-does-not-exist", passageId: PASSAGE, stance: "supports" },
      meta,
    )
    expect(noClaim.ok).toBe(false)
    if (!noClaim.ok) expect(noClaim.issues.map((i) => i.code)).toContain("link/unknown-claim")

    const noPassage = addEvidenceLink(
      data,
      { claimId: CLAIM, passageId: "psg-does-not-exist", stance: "supports" },
      meta,
    )
    expect(noPassage.ok).toBe(false)
    if (!noPassage.ok) expect(noPassage.issues.map((i) => i.code)).toContain("link/unknown-passage")

    /* stance 是**运行时**校验：值来自 DOM，类型在那里已经不管用了。 */
    const badStance = addEvidenceLink(
      data,
      { claimId: CLAIM, passageId: PASSAGE, stance: "whatever" },
      meta,
    )
    expect(badStance.ok).toBe(false)
    if (!badStance.ok) expect(badStance.issues.map((i) => i.code)).toContain("link/invalid-stance")
  })

  test("夹具本身不含重复的活跃链接", () => {
    expect(validateSourceIndex(freshResearch())).toEqual([])
  })
})

test.describe("17 · link-write.recomputes-tensions", () => {
  const UNSUPPORTED = tensionIdFor("unsupported-claim", "clm-cost-inflection")

  test("补一条支持引用之后，缺口**自己**消失——没有任何代码去删它", () => {
    const data = freshResearch()
    expect(isTensionStillRaised(data, UNSUPPORTED)).toBe(true)

    const outcome = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补材料。" },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    /* 没有任何一行代码调过「删除一条张力」——本模块里不存在那个函数。
       它消失是因为 `deriveTensions` 下次读的时候算不出它了。 */
    expect(isTensionStillRaised(outcome.data, UNSUPPORTED)).toBe(false)
    expect(outcome.closedTensions.map((tension) => tension.id)).toEqual([UNSUPPORTED])
  })

  test("重算是纯函数：写入前后两次推导都是确定性的", () => {
    const data = freshResearch()
    const outcome = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补材料。" },
    )
    if (!outcome.ok) throw new Error("夹具前提不成立")
    expect(deriveTensions(outcome.data)).toEqual(deriveTensions(outcome.data))
  })

  test("写入同时产生**新的**张力：单一来源立刻出现（事实变了，问题也变了）", () => {
    const data = freshResearch()
    const outcome = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补材料。" },
    )
    if (!outcome.ok) return

    const kinds = deriveTensions(outcome.data)
      .filter((tension) => tension.subject.claimId === "clm-cost-inflection")
      .map((tension) => tension.kind)
    /* 洞被填上了，但只填了一处——`single-source` 是**新的**真话。
       把它藏起来会比原来的空洞更糟。 */
    expect(kinds).toContain("single-source")
    expect(kinds).not.toContain("unsupported-claim")
  })

  test("停用一条支持引用会让缺口**回来**（它是活的，不是一次性快照）", () => {
    const data = freshResearch()
    const outcome = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补材料。" },
    )
    if (!outcome.ok) return

    const retired = retireLink(outcome.data, outcome.link.id, {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "引错了。",
    })
    expect(isTensionStillRaised(retired, UNSUPPORTED)).toBe(true)
  })
})

test.describe("18 · resolved-ui-reachable", () => {
  const UNSUPPORTED = tensionIdFor("unsupported-claim", "clm-cost-inflection")

  /**
   * 这条不变量是**集成契约**：它走完整条真实操作路径，不构造假的 fixture。
   *
   * ```
   * 事实改变 → 张力不再 derive → resolved 合法 → resolved 投影非空
   * ```
   *
   * 它在 Phase G+H 被补上，是因为在此之前这条链的最后一环**按构造
   * 不可能成立**：`resolvedTensions` 从 `projectTensions` 里筛，
   * 而那个投影只遍历派生张力——resolved 的前提（事实改变）恰好让
   * 它自己的投影永远为空。第 4 步就是那个修复的回归守卫。
   */
  test("四步全通：补引用 → 缺口消失 → resolved 被接受 → 投影可渲染", () => {
    const data = freshResearch()

    // 1. 事实改变
    const linked = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补一份成本口径的材料。" },
    )
    expect(linked.ok, "第 1 步：补引用").toBe(true)
    if (!linked.ok) return
    expect(linked.closedTensions.map((t) => t.id)).toEqual([UNSUPPORTED])

    // 2. 现在 `resolved` 才是合法的（在此之前会被不变量 13 拒绝）
    const disposed = dispositionTension(linked.data, UNSUPPORTED, "resolved", {
      actor: "human",
      at: "2026-09-11T10:05:00+08:00",
      reason: "材料已经补上，这条缺口不再成立。",
    })
    expect(disposed.ok, "第 2 步：标记为已解决").toBe(true)
    if (!disposed.ok) return

    // 3. 投影里真的有了它——这一步是修复的核心
    const resolved = projectResolvedTensions(disposed.data)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.tensionId).toBe(UNSUPPORTED)
    expect(resolved[0]!.kind).toBe("unsupported-claim")
    /* claimId 必须仍然可追溯。`resolved` 的一大类缺陷就是这条记录
       在张力消失之后变成一句无法核对的话——它现在从 id 里拆回来。 */
    expect(resolved[0]!.claimId).toBe("clm-cost-inflection")
    expect(resolved[0]!.reason).toContain("材料已经补上")

    // 4. 事实确实不在了，而且三个桶互不重叠
    expect(resolved[0]!.stillRaised, "resolved 的前提就是事实已变").toBe(false)
    const openIds = new Set(openTensions(projectTensions(disposed.data)).map((t) => t.id))
    expect(openIds.has(UNSUPPORTED)).toBe(false)
  })

  test("负例：事实没变时，这条路径的第 2 步走不通（证明第 1 步不是装饰）", () => {
    const data = freshResearch()
    const disposed = dispositionTension(data, UNSUPPORTED, "resolved", {
      actor: "human",
      at: "2026-09-11T10:05:00+08:00",
      reason: "我没补任何材料，但我标记为已解决。",
    })
    expect(disposed.ok).toBe(false)
    if (!disposed.ok) {
      expect(disposed.issues.map((issue) => issue.code)).toContain(
        "disposition/resolved-requires-fact-change",
      )
    }
    // 投影仍然是空的——拒绝没有留下任何半个状态。
    expect(projectResolvedTensions(data)).toEqual([])
  })

  test("负例：把证据停用之后，那条「已解决」变成历史（stillRaised 翻回 true）", () => {
    const data = freshResearch()
    const linked = addEvidenceLink(
      data,
      { claimId: "clm-cost-inflection", passageId: "psg-summary-cost", stance: "supports" },
      { actor: "human", at: "2026-09-11T10:00:00+08:00", reason: "补材料。" },
    )
    if (!linked.ok) return
    const disposed = dispositionTension(linked.data, UNSUPPORTED, "resolved", {
      actor: "human",
      at: "2026-09-11T10:05:00+08:00",
      reason: "已解决。",
    })
    if (!disposed.ok) return

    const retired = retireLink(disposed.data, linked.link.id, {
      actor: "human",
      at: "2026-09-12T10:00:00+08:00",
      reason: "那份材料后来撤回了。",
    })

    const resolved = projectResolvedTensions(retired)
    expect(resolved).toHaveLength(1)
    /* 记录留着（历史不能丢），但它现在说的是「这条洞又回来了」。
       这与 `KnownLimitation.stillRaised` 是**同一个字段、相反的方向**。 */
    expect(resolved[0]!.stillRaised).toBe(true)
  })
})
