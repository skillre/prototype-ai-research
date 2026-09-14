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
  Actor,
  DerivedTension,
  Id,
  IsoTimestamp,
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

/** 全部 kind。与 `TensionKind` 的一致性由下面的编译期断言保证。 */
const ALL_TENSION_KINDS = [
  "unsupported-claim",
  "contradictory-evidence",
  "single-source",
  "stale-source",
  "low-quality-evidence",
] as const

/** 若 `TensionKind` 多了一个成员而上面的数组没跟上，这一行会编译失败。 */
type MissingTensionKind = Exclude<TensionKind, (typeof ALL_TENSION_KINDS)[number]>
const _allTensionKindsCovered: MissingTensionKind extends never ? true : never = true
void _allTensionKindsCovered

/**
 * `tensionIdFor` 的逆运算。
 *
 * ## 为什么需要它（Phase E 暴露出来的一个真实缺口）
 *
 * 「张力还在吗」这个问题有一个**致命歧义**：
 *
 * ```
 * isTensionStillRaised(data, id) === false
 *   可能意味着 (a) 这个洞被事实填上了     ← 合法
 *   也可能意味着 (b) 这个 id 根本不存在   ← 打错了字
 * ```
 *
 * 两者在处置时**后果完全相反**：前者允许 `resolved`，后者必须被拒绝
 * （否则一次手误就会在历史里留下一条谁也对不上的处置记录）。
 * 只看 `isTensionStillRaised` 无法区分，所以必须能把 id 拆回 `(kind, claimId)`，
 * 再问一句「这条论断存在吗」。
 *
 * 这也是为什么 id 的格式不是实现细节：`${kind}::${claimId}` 是**可逆的**，
 * 于是「这条处置说的是哪条论断的哪个问题」永远可以被验证，
 * 而不是只能相信调用方传对了一个字符串。
 */
export function parseTensionId(id: Id): { kind: TensionKind; claimId: Id } | null {
  const separator = id.indexOf("::")
  if (separator <= 0) return null

  const kind = id.slice(0, separator)
  const claimId = id.slice(separator + 2)
  if (claimId.length === 0) return null
  if (!(ALL_TENSION_KINDS as readonly string[]).includes(kind)) return null

  return { kind: kind as TensionKind, claimId }
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

/**
 * 张力是否仍然存在。
 *
 * 这是一个很小但必要的函数：**处置不会让张力消失**，它只是标记为已处理。
 * 界面需要能问「这个洞现在还开着吗」，答案既取决于事实（洞在不在）
 * 也取决于处置（要不要填）。
 *
 * 注意「重算后张力还在，但处置说已解决」是**正常且期望**的状态：
 * 研究者判断这个洞可以接受，事实并没有改变。
 *
 * ⚠ 但它有一个歧义：返回 `false` 既可能是「事实填上了」，也可能是
 * 「这个 id 根本不存在」。需要区分时配合 `parseTensionId` 用——见
 * `dispositionTension` 的处理：先证明论断存在，再看事实。
 */
export function isTensionStillRaised(data: ResearchData, tensionId: Id): boolean {
  return deriveTensions(data).some((tension) => tension.id === tensionId)
}

/* -------------------------------------------------------------------------- */
/* 处置的两条读取面：已知局限 / 已解决                                             */
/* -------------------------------------------------------------------------- */

/**
 * 处置记录投影出来的公共部分。
 *
 * 两个出口（`resolved` / `accepted-as-limitation`）的形状**故意是同构的**：
 * 它们都是「人对一条张力的判断」，都带 id、理由、时间、以及
 * 「这条张力现在还在不在」。差异只有名字与那一个布尔值的方向。
 *
 * 抽出来是为了**只有一份**「处置 → 记录」的映射。这两个投影各自实现一遍
 * 的话，`parseTensionId` 的兜底逻辑就会有两份，而它们迟早会分叉——
 * 到时候「已解决」那段会开始丢 claimId，而且不会有任何东西报错。
 */
interface DispositionRecord {
  tensionId: Id
  kind: TensionKind
  severity: TensionSeverity
  /** 这条记录挂在哪条论断上。**永远可追溯**——边界不是一句漂浮的话。 */
  claimId: Id
  /** 人写下的原文。 */
  reason: string
  at: IsoTimestamp
  actor: Actor
  /**
   * 这条记录对应的**事实现在还在不在**。
   *
   * 它是两个出口之间唯一的方向性差异：
   * ```
   * accepted-as-limitation   stillRaised === true   洞还在，我带着它交付
   * resolved                 stillRaised === false  洞没了（这正是它的前提）
   * ```
   * 界面必须能读到它，否则「接受」会慢慢看起来像「解决」——
   * 那正是本产品在防的那件事。
   */
  stillRaised: boolean
}

/**
 * 把某一类处置投影成记录。
 *
 * ## 为什么**不能**从 `deriveTensions` 出发
 *
 * Phase G+H 在这里修掉了一个真实的投影缺陷——它同时也是「已解决」
 * 那段界面从未渲染过的**根本原因**：
 *
 * ```
 * 旧实现：tensions = projectTensions(data)        // = deriveTensions 的产物
 *         resolved = tensions.filter(…)           // ← 恒为空
 * ```
 *
 * `resolved` 的**前提**就是事实改变（不变量 13 守着这一点），而事实一变，
 * `deriveTensions` 就不再产出那条张力了。于是处置记录存在、也没有任何
 * `Tension` 对象携带它——**这个投影按构造就永远是空的**。
 *
 * 所以「已解决」和「已知局限」一样，必须从 **dispositions** 出发：
 * 它记录的是「这里曾经有一个洞，现在没了」。那是一件历史事实，
 * 不是一个从当前数据能重新推导出来的状态。
 *
 * ## 全部是派生的
 *
 * 没有新的存储。来源只有两处：`data.dispositions`（人的输入）与
 * `deriveTensions(data)`（事实）。所以它不可能与事实漂移。
 */
function projectDispositions(
  data: ResearchData,
  resolution: TensionDisposition["resolution"],
): DispositionRecord[] {
  const raised = new Map(deriveTensions(data).map((tension) => [tension.id, tension]))

  return data.dispositions
    .filter((disposition) => disposition.resolution === resolution)
    .map((disposition) => {
      const tension = raised.get(disposition.tensionId)
      /* 张力重算不出来时，仍然用 id 拆出 claimId —— 这条记录**必须仍然可追溯**，
         哪怕它指向的事实已经消失。丢字段会让历史记录变成一句无法核对的话。
         对 `resolved` 来说这是常态路径，不是例外。 */
      const parsed = parseTensionId(disposition.tensionId)
      return {
        tensionId: disposition.tensionId,
        kind: tension?.kind ?? parsed?.kind ?? "unsupported-claim",
        severity: tension?.severity ?? "notable",
        claimId: tension?.subject.claimId ?? parsed?.claimId ?? "",
        reason: disposition.reason,
        at: disposition.at,
        actor: disposition.actor,
        stillRaised: tension !== undefined,
      }
    })
    .sort((a, b) => a.tensionId.localeCompare(b.tensionId))
}

/**
 * 一条**被接受的局限**。
 *
 * 每个字段都能追到一条已存的处置记录，或一条可重算的张力事实。
 */
export interface KnownLimitation {
  tensionId: Id
  kind: TensionKind
  severity: TensionSeverity
  claimId: Id
  reason: string
  acceptedAt: IsoTimestamp
  actor: Actor
  /** `true` 是常态，也是 `accepted-as-limitation` 的定义。 */
  stillRaised: boolean
}

/**
 * 已知局限投影 —— `accepted-as-limitation` 处置的读取面。
 *
 * ## 它为什么必须存在
 *
 * 「接受为已知局限」如果没有一个**独立的投影**，它在界面上就只剩一个
 * 已处理标记——而那个标记和「已解决」用的是同一个。这正是 `types.ts` 里
 * 那条立场要防的事：一个有边界的结论比一个假装完整的结论可信得多，
 * 但前提是**边界本身是可读的**。
 *
 * ## 为什么它不属于 Finding
 *
 * `Finding.knownLimitations` 是一组字符串，是**交付物**；
 * 这里是一组带 id 的记录，是**可追溯的现状**。前者是后者的下游产物，
 * 而且必须由人决定怎么措辞——不是把 reason 数组直接倒进去。
 * 见 `Finding.knownLimitationRefs`。
 */
export function projectKnownLimitations(data: ResearchData): KnownLimitation[] {
  return projectDispositions(data, "accepted-as-limitation").map((record) => ({
    tensionId: record.tensionId,
    kind: record.kind,
    severity: record.severity,
    claimId: record.claimId,
    reason: record.reason,
    acceptedAt: record.at,
    actor: record.actor,
    stillRaised: record.stillRaised,
  }))
}

/**
 * 一条**已被解决**的张力。
 *
 * 与 `KnownLimitation` 同构，但语义相反：这条记录说的是「这里曾经有一个洞，
 * 事实改变之后它不再被推导出来了」。
 */
export interface ResolvedTension {
  tensionId: Id
  kind: TensionKind
  severity: TensionSeverity
  claimId: Id
  /** 当时写下为什么可以标记为已解决。 */
  reason: string
  resolvedAt: IsoTimestamp
  actor: Actor
  /**
   * 事实现在还在不在。
   *
   * 对 `resolved` 来说**正常情况下必须是 `false`**——守卫（不变量 13）
   * 只允许在事实改变之后做这个处置。`true` 意味着证据后来被停用了，
   * 洞又回来了：那条「已解决」记录就成了历史，而不是现状。
   * 这与 `KnownLimitation.stillRaised` 的方向正好相反，而且是刻意的。
   */
  stillRaised: boolean
}

/**
 * 已解决投影 —— `resolved` 处置的读取面。
 *
 * 与 `projectKnownLimitations` 对称，理由见 `projectDispositions` 的说明：
 * 从 dispositions 出发而不是从 `deriveTensions` 出发，是因为这个处置
 * **以事实改变为前提**，而事实一变它就再也推导不出来了。
 */
export function projectResolvedTensions(data: ResearchData): ResolvedTension[] {
  return projectDispositions(data, "resolved").map((record) => ({
    tensionId: record.tensionId,
    kind: record.kind,
    severity: record.severity,
    claimId: record.claimId,
    reason: record.reason,
    resolvedAt: record.at,
    actor: record.actor,
    stillRaised: record.stillRaised,
  }))
}

