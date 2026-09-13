/**
 * Tension derivation —— 产品的核心机制。
 *
 * ## 为什么张力是派生的
 *
 * 研究者最大的失败模式不是漏了资料，是**没注意到自己的论证有个洞**。
 * 所以「缺口」不能是用户亲手填的字段——他正是那个没注意到的人。
 * 张力必须从 (Claims, Links, Sources) 算出来。
 *
 * ## 为什么处置单独存
 *
 * 事实和人话必须分开：
 *
 * ```
 * DerivedTension      pure function of (claims, links, sources)   ← 永远重算
 * TensionDisposition  人的输入，存 in ResearchData.dispositions    ← 永不重算
 * Tension             两者合并后的投影，UI 读这个                  ← 读取时合成
 * ```
 *
 * 如果 `resolution` 挂在 tension 对象上，「重算张力」就必须小心翼翼地保留它——
 * 那是一次「记得别写错」的机会，而这类机会总会被写错。分开存之后，
 * `tension.is-derived` 这条不变量变成结构上自动成立的，而不是需要维护的。
 *
 * ## 为什么 id 必须确定性
 *
 * `id = ${kind}::${claimId}`，不含任何随机或时间成分。
 * 换 id 意味着人的处置找不到自己的对象——处置会静默丢失，而界面看起来正常。
 */

import {
  activeClaims,
  evidenceForClaim,
  getSourceForPassage,
} from "./projections"
import type {
  DerivedTension,
  Id,
  ResearchData,
  Tension,
  TensionDisposition,
  TensionKind,
  TensionSeverity,
  TensionSubject,
} from "./types"

/**
 * 张力的确定性标识。
 *
 * 一个 (kind, claim) 只对应一条张力：同一论断上出现多个同类问题时聚合进
 * 同一条，details 放在 subject 里。这避免了「12 条 single-source」把
 * 未决事项带淹掉——一条张力应该代表一个需要被处理的问题，不是一次出现。
 */
export function tensionIdFor(kind: TensionKind, claimId: Id): string {
  return `${kind}::${claimId}`
}

/** 严重度由 kind 决定，不是人填的。 */
const SEVERITY: Record<TensionKind, TensionSeverity> = {
  // 阻断：这些会让结论站不住，或者让引用无法核对。
  "unsupported-claim": "blocking",
  "contradictory-evidence": "blocking",
  "stale-source": "blocking",
  // 值得注意：结论仍然可用，但它比看上去弱。
  "single-source": "notable",
  "low-quality-evidence": "notable",
}

/**
 * 从基础数据推导全部张力。
 *
 * **只在活跃论断上推导。** 撤回的论断不产生噪音——它已经不在论证里了，
 * 对它喊「没有证据支撑」是错的，而且会让未决事项带失去可信度。
 */
export function deriveTensions(data: ResearchData): DerivedTension[] {
  const result: DerivedTension[] = []

  for (const claim of activeClaims(data)) {
    const links = evidenceForClaim(data, claim.id)

    const supports = links.filter((link) => link.stance === "supports")
    const contradicts = links.filter((link) => link.stance === "contradicts")

    /** 支持链接解析到的来源，含不可核对的——张力关心的是「你引用了什么」。 */
    const supportSources = supports
      .map((link) => getSourceForPassage(data, link.passageId))
      .filter((source) => source !== undefined)
    const distinctSupportSourceIds = [...new Set(supportSources.map((source) => source.id))]

    /** 依据无法核对的链接（来源缺失或 validity != ok）。 */
    const unverifiable = links.filter((link) => {
      const source = getSourceForPassage(data, link.passageId)
      return !source || source.validity !== "ok"
    })

    const push = (kind: TensionKind, subject: TensionSubject) =>
      result.push({
        id: tensionIdFor(kind, claim.id),
        researchId: claim.researchId,
        kind,
        subject,
        severity: SEVERITY[kind],
      })

    /* 1 · unsupported-claim —— 一条论断，没有任何支持。 */
    if (supports.length === 0) {
      push("unsupported-claim", { claimId: claim.id })
    }

    /* 2 · contradictory-evidence —— 存在反驳。信息量最大的一类。 */
    if (contradicts.length > 0) {
      push("contradictory-evidence", {
        claimId: claim.id,
        linkIds: contradicts.map((link) => link.id),
      })
    }

    /* 3 · single-source —— 有支持，但全部来自同一个来源。 */
    if (supports.length > 0 && distinctSupportSourceIds.length === 1) {
      push("single-source", { claimId: claim.id, sourceIds: distinctSupportSourceIds })
    }

    /* 4 · stale-source —— 引用已无法核对。 */
    if (unverifiable.length > 0) {
      push("stale-source", {
        claimId: claim.id,
        linkIds: unverifiable.map((link) => link.id),
        sourceIds: [
          ...new Set(
            unverifiable
              .map((link) => getSourceForPassage(data, link.passageId)?.id)
              .filter((id): id is Id => id !== undefined),
          ),
        ],
      })
    }

    /* 5 · low-quality-evidence —— 有支持，但支持它的**全部**是三手来源。 */
    const weak = (type: string) => type === "tertiary" || type === "unknown"
    if (supportSources.length > 0 && supportSources.every((source) => weak(source.sourceType))) {
      push("low-quality-evidence", {
        claimId: claim.id,
        linkIds: supports.map((link) => link.id),
        sourceIds: distinctSupportSourceIds,
      })
    }
  }

  // 稳定排序：先阻断后提示，同组按 id。输出的确定性让快照测试有意义。
  return result.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

/**
 * 把派生事实与人的处置合并成 UI 读的张力。
 *
 * 处置按 `tensionId` 关联。**找不到处置 = 未处理**，这是默认值而不是错误：
 * 绝大多数张力本来就还没被处理。
 */
export function projectTensions(data: ResearchData): Tension[] {
  const dispositions = new Map<Id, TensionDisposition>(
    data.dispositions.map((disposition) => [disposition.tensionId, disposition]),
  )

  return deriveTensions(data).map((tension) => {
    const disposition = dispositions.get(tension.id)
    return {
      ...tension,
      resolution: disposition?.resolution ?? null,
      dispositionReason: disposition?.reason,
      dispositionAt: disposition?.at,
    }
  })
}

/** 未处理的张力——Tension Rail 的内容。 */
export function openTensions(tensions: Tension[]): Tension[] {
  return tensions.filter((tension) => tension.resolution === null)
}

/** 已处理的张力，含「承认为局限」。 */
export function closedTensions(tensions: Tension[]): Tension[] {
  return tensions.filter((tension) => tension.resolution !== null)
}

/**
 * 张力是否仍然存在。
 *
 * 这是一个很小但必要的函数：**处置不会让张力消失**，它只是标记为已处理。
 * 界面需要能问「这个洞现在还开着吗」，答案既取决于事实（洞在不在）
 * 也取决于处置（要不要填）。
 *
 * 注意「重算后张力还在，但处置说已解决」是**正常且期望**的状态：
 * 研究者判断这个洞可以接受，事实并没有改变。
 */
export function isTensionStillRaised(data: ResearchData, tensionId: Id): boolean {
  return deriveTensions(data).some((tension) => tension.id === tensionId)
}
