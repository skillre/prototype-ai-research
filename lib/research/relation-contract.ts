/**
 * Relation Presentation Contract.
 *
 * ## 它解决的问题
 *
 * 产品的核心关系是 `Passage ── EvidenceLink ──> Claim`，stance 为
 * `supports` / `contradicts` / `qualifies` / `context`。
 *
 * 如果没有这份契约，这四个词会变成**散落在各个组件里的分支**：
 *
 * ```tsx
 * if (stance === "contradicts") { … }   // ✗ 散落、会漂移、无法穷尽测试
 * ```
 *
 * 有了它，界面只能消费 `getRelationPresentation(stance)` 的产物。语义是否完整
 * 由一个地方保证，并且可以被穷尽测试。
 *
 * ## 本文件的三条硬约束
 *
 * 1. **不依赖 React。** 它是纯数据 + 纯函数。唯一的 import 是 `import type`，
 *    在运行时被完全擦除——所以它可以直接被 Node 导入来生成 fixture。
 * 2. **不出现任何样式实现。** 没有 Tailwind class、没有颜色值、没有 pack 名、
 *    没有 CSS 变量。`form: "reverse-arrow"` 是**形状描述**，不是实现。
 *    具体视觉属于 Phase D 的产品适配层。
 * 3. **线不是唯一语义载体。** `lineStyle` 在契约里存在，但它是 decorative：
 *    移动端直接不画线，语义完整保留。见 `mobile` 与 `a11y` 两节。
 *
 * ## 五个通道，缺一不可
 *
 * 每个 stance 必须同时具备：**词**（label）、**形**（form）、**序**（order）、
 * **语义**（a11y / confidenceRole）、**窄屏降级**（mobile）。少任何一个，
 * 某个场景下这个关系就会「只能靠颜色或只能靠线」才能读懂——那等于读不懂。
 */

import type { Stance } from "./types"

/** 契约版本。fixture 与实现比对时用它判断是否同一代。 */
export const RELATION_CONTRACT_VERSION = "1.0.0"

/* -------------------------------------------------------------------------- */
/* 通道取值（封闭 union，可序列化，可穷尽测试）                                    */
/* -------------------------------------------------------------------------- */

/**
 * 形状通道。**必须是非颜色通道** —— 灰度化之后仍然可区分。
 *
 * 这些是**形状描述词**，不是 CSS class，也不绑定任何图标库。
 */
export type RelationForm =
  /** 实心贴片，紧贴论断（顺流）。 */
  | "solid-attached"
  /** 贴片带反向箭头并渲染在论断**上方**（逆流）。 */
  | "reverse-arrow"
  /** 贴片带缺角。 */
  | "notched"
  /** 半透明、无边框、缩进下沉。 */
  | "recessed"

/** 连线样式。装饰性——移动端为 `none`。 */
export type RelationLineStyle = "solid" | "reverse" | "dashed" | "none"

/**
 * 辅助符号的**语义 token**。
 *
 * 刻意不是 Lucide 图标名：绑定具体图标库会让契约依赖一个会变的实现细节，
 * 而契约应该只在 Phase D 的适配层里被翻译成图标。
 */
export type RelationGlyphToken =
  | "support-mark"
  | "counter-mark"
  | "qualifier-mark"
  | "context-mark"

/** 窄屏排序位置。1 最先。 */
export type RelationOrder = 1 | 2 | 3 | 4

/**
 * 这个 stance 在**证据强度**里扮演什么角色。
 *
 * 用四值枚举而不是 `contributesToConfidence: boolean`：布尔值会丢掉
 * 「限定」和「反驳」的区别——前者限制结论的适用范围，后者直接对抗它。
 * 这两件事在界面上的分量完全不同，压成一个 `false` 就再也拿不回来了。
 *
 * ## ⚠ 现状：`limiting` 是 declared semantic，当前没有消费方
 *
 * `deriveClaimConfidence()`（`lib/research/projections.ts`）**只消费 `supports`**。
 * 也就是说：
 *
 * | role | 声明 | 当前是否真的影响强度 |
 * |---|---|---|
 * | `supporting` | supports | ✅ 是 |
 * | `counter` | contradicts | ✅ 是（降一级） |
 * | `limiting` | qualifies | ❌ **否** |
 * | `neutral` | context | ✅ 是（不参与） |
 *
 * `qualifies` **应该**限制结论的适用范围，但那条规则还没有被写出来。这是一个
 * **声明的意图**，不是一条被执行的规则——与 `Claim.kind` 同一类状态。
 *
 * 本契约只**声明**角色，不重复实现计算。补上限定逻辑时，规则、测试、以及
 * 消费它的派生函数必须**一起**进来，而不是在这里先假装它已经生效。
 */
export type ConfidenceRole =
  /** 支持结论。 */
  | "supporting"
  /** 对抗结论。 */
  | "counter"
  /** 限制结论的适用范围。 */
  | "limiting"
  /** 只提供背景，不承载论证力。 */
  | "neutral"

/** 点击一条证据时能做什么。 */
export type RelationPrimaryAction = "reveal-passage"

/**
 * 点击之后人在哪里。
 *
 * `inline` 是刻意的，也是不可协商的：点击证据**必须就地展开原文**，
 * 不能把用户带离 Argument Chain。离开链条就丢掉了「你在哪一环」这个上下文，
 * 而这个上下文正是整个第一屏设计的基础。
 */
export type RelationNavigation = "inline"

/* -------------------------------------------------------------------------- */
/* 契约形状                                                                     */
/* -------------------------------------------------------------------------- */

export interface RelationInteraction {
  primary: RelationPrimaryAction
  navigation: RelationNavigation
}

export interface RelationA11y {
  /**
   * 可访问名的固定前缀。
   *
   * 它**必须与 `label` 逐字相同**，并且必须**始终出现在**生成的可访问名里。
   * 这是「关系不依赖 SVG title / 颜色 / 箭头图形来传递唯一信息」的落点：
   * 无障碍树里唯一承载关系的就是这个词。
   */
  labelPrefix: string
  /** 可访问名模板。占位符 `{locator}` 与 `{text}`。 */
  accessibleNameTemplate: string
  /**
   * 论断这一级要播报的一句话。只有 `contradicts` 有。
   *
   * 这条是给「用户在链条上读到这条论断」的场景用的：屏幕阅读器用户不能靠
   * 视觉上的「逆流位置」感知到反驳，需要一个显式的句子。
   */
  claimAnnouncement?: string
}

/**
 * 窄屏降级。
 *
 * **只描述语义，不描述画什么。** 390px 下到底出不出视觉连接线，是 Phase D 的
 * layout / rendering 决定，不是稳定契约的一部分——这里曾经有一个
 * `showsConnector: boolean`，它把一个布局决策写进了语义层。
 *
 * 窄屏能保证的是三件事：**词**（`labelTemplate` 里的 `{label}`）、**序**（`order`）、
 * 以及**分组**（属于同一条论断的证据聚在一起）。有这三样，即使一个 pixel 都不画，
 * 关系也读得出来。
 */
export interface RelationMobile {
  /**
   * 窄屏标签模板。占位符 `{label}` 与 `{locator}`。
   *
   * 模板必须含 `{label}` —— 窄屏不画线，「词 + 顺序」承担全部语义。
   */
  labelTemplate: string
}

/** 一个 stance 的完整语义表达。 */
export interface RelationPresentation {
  stance: Stance
  /** 中文固定词。语义的第一载体。 */
  label: string
  glyph: RelationGlyphToken
  /** 窄屏排序位置，1 最先。 */
  order: RelationOrder
  /** 形状通道（非颜色）。 */
  form: RelationForm
  /** 连线样式。装饰性。 */
  lineStyle: RelationLineStyle
  /** 在证据强度里的角色。 */
  confidenceRole: ConfidenceRole
  interaction: RelationInteraction
  a11y: RelationA11y
  mobile: RelationMobile
}

/** 契约注册表：每个 stance 一份。 */
export type RelationContract = Record<Stance, RelationPresentation>

/* -------------------------------------------------------------------------- */
/* Stance 的单一事实来源                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 全部 stance，按**窄屏顺序**排列。
 *
 * 编译期保证：`Stance` union 里出现任何不在这个数组里的成员，下面的
 * `_allStancesCovered` 就会变成 `never`，赋值直接编译失败。
 * 也就是说**新增一个 stance 却忘了加进契约，`pnpm typecheck` 会拦住**，
 * 而不是等到某个页面上少显示一种关系时才发现。
 */
export const ALL_STANCES = ["contradicts", "supports", "qualifies", "context"] as const

type MissingStance = Exclude<Stance, (typeof ALL_STANCES)[number]>
// 若 MissingStance 不是 never，这一行会编译失败。
const _allStancesCovered: MissingStance extends never ? true : never = true
void _allStancesCovered

/* -------------------------------------------------------------------------- */
/* 契约本体                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 四个 stance 的完整表达。
 *
 * 两条来自 Phase 2 人工 checkpoint 的决定，在这里变成机器可检查的事实：
 * **`contradicts` 排在最前**（逆流：反驳先于支持出现），以及
 * **`context` 不参与证据强度**。
 */
export const RELATION_CONTRACT: RelationContract = {
  contradicts: {
    stance: "contradicts",
    label: "反驳",
    glyph: "counter-mark",
    // 最先。这是「逆流」在窄屏上的唯一残影——没有线，但顺序还在。
    order: 1,
    form: "reverse-arrow",
    lineStyle: "reverse",
    confidenceRole: "counter",
    interaction: { primary: "reveal-passage", navigation: "inline" },
    a11y: {
      labelPrefix: "反驳",
      accessibleNameTemplate: "{label} · {locator} · 原文：{text}",
      claimAnnouncement: "本条存在反驳证据",
    },
    mobile: {
      labelTemplate: "{label} · {locator}",
    },
  },

  supports: {
    stance: "supports",
    label: "支持",
    glyph: "support-mark",
    order: 2,
    form: "solid-attached",
    lineStyle: "solid",
    confidenceRole: "supporting",
    interaction: { primary: "reveal-passage", navigation: "inline" },
    a11y: {
      labelPrefix: "支持",
      accessibleNameTemplate: "{label} · {locator} · 原文：{text}",
    },
    mobile: {
      labelTemplate: "{label} · {locator}",
      // 唯一在窄屏仍画线的 stance：「紧贴」是 supports 的形状语义，
      // 而它在单列布局里靠缩进对齐就能表达，成本为零。
    },
  },

  qualifies: {
    stance: "qualifies",
    label: "限定",
    glyph: "qualifier-mark",
    order: 3,
    form: "notched",
    lineStyle: "dashed",
    confidenceRole: "limiting",
    interaction: { primary: "reveal-passage", navigation: "inline" },
    a11y: {
      labelPrefix: "限定",
      accessibleNameTemplate: "{label} · {locator} · 原文：{text}",
    },
    mobile: {
      labelTemplate: "{label} · {locator}",
    },
  },

  context: {
    stance: "context",
    label: "背景",
    glyph: "context-mark",
    order: 4,
    form: "recessed",
    lineStyle: "none",
    // 有视觉语义、有可访问语义、有排序位置 —— 但**不参与证据强度**。
    confidenceRole: "neutral",
    interaction: { primary: "reveal-passage", navigation: "inline" },
    a11y: {
      labelPrefix: "背景",
      accessibleNameTemplate: "{label} · {locator} · 原文：{text}",
    },
    mobile: {
      labelTemplate: "{label} · {locator}",
    },
  },
}

/* -------------------------------------------------------------------------- */
/* 访问器                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 取一个 stance 的完整表达。
 *
 * **穷尽 switch，没有 `default: return supports` 这种静默回退。**
 * 静默回退的后果很具体：一个新 stance 在界面上会被当成 `supports` 渲染，
 * 而且不报错——错误的关系显示得和正确的一样自信。
 *
 * 这里的 `default` 分支只做一件事：证明它不可达，否则抛错。
 */
export function getRelationPresentation(stance: Stance): RelationPresentation {
  switch (stance) {
    case "supports":
      return RELATION_CONTRACT.supports
    case "contradicts":
      return RELATION_CONTRACT.contradicts
    case "qualifies":
      return RELATION_CONTRACT.qualifies
    case "context":
      return RELATION_CONTRACT.context
    default: {
      // 穷尽性断言：到这一行说明 Stance 多了一个成员而契约没跟上。
      const exhaustive: never = stance
      throw new Error(
        `未知 stance：${String(exhaustive)}。契约没有覆盖它——不要静默回退到某个默认关系。`,
      )
    }
  }
}

/** 窄屏排序比较器。`Array.prototype.sort(compareRelations)` 直接用。 */
export function compareRelations(a: RelationPresentation, b: RelationPresentation): number {
  return a.order - b.order
}

/** 一个 stance 在灰度下的区分键：形状 + 顺序。**不含颜色。** */
export function grayscaleKey(presentation: RelationPresentation): string {
  return `${presentation.form}:${presentation.order}`
}

/* -------------------------------------------------------------------------- */
/* 窄屏标签                                                                     */
/* -------------------------------------------------------------------------- */

/** 填充 `{label}` / `{locator}` / `{text}` 占位符。纯字符串操作，不涉及 DOM。 */
function fillTemplate(
  template: string,
  values: { label: string; locator: string; text: string },
): string {
  return template
    .replaceAll("{label}", values.label)
    .replaceAll("{locator}", values.locator)
    .replaceAll("{text}", values.text)
}

/**
 * 窄屏下一条证据的标签，例如 `支持 · 第 4 页第 2 段`。
 *
 * `locatorLabel` 由调用方提供——**不要在这里硬编码定位文本**。
 * 「第 4 页第 2 段」与「00:12:40」是两种不同的定位方式，它们的格式化属于
 * 呈现层，不属于关系契约。
 */
export function formatRelationMobileLabel(stance: Stance, locatorLabel: string): string {
  const presentation = getRelationPresentation(stance)
  return fillTemplate(presentation.mobile.labelTemplate, {
    label: presentation.label,
    locator: locatorLabel,
    text: "",
  })
}

/* -------------------------------------------------------------------------- */
/* 可访问名                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 可访问名里原文的字符预算。
 *
 * 超过了只截断**原文部分**，`stance` 词与定位永远保留 —— 一个长引文不该
 * 把「这条到底是支持还是反驳」挤出可访问名。
 */
const PASSAGE_BUDGET = 160

function clampPassage(text: string): string {
  return text.length <= PASSAGE_BUDGET ? text : `${text.slice(0, PASSAGE_BUDGET)}…`
}

/**
 * 生成一条证据的可访问名，例如
 * `支持 · 第 4 页第 2 段 · 原文：两条产线已于…`。
 *
 * 这是「关系必须有文本 / semantic fallback」的落点。无障碍树里唯一承载关系的
 * 就是开头那个 stance 词——不是 SVG title，不是颜色，不是箭头形状。
 * `DOM_SEMANTIC_COUNT` 那类检查能通过，但如果可访问名里没有关系词，
 * 屏幕阅读器用户读到的就只是一串引用，读不出**它们之间的关系**。
 */
export function buildEvidenceAccessibleName(
  stance: Stance,
  locatorLabel: string,
  passageText: string,
): string {
  const presentation = getRelationPresentation(stance)
  return fillTemplate(presentation.a11y.accessibleNameTemplate, {
    label: presentation.label,
    locator: locatorLabel,
    text: clampPassage(passageText.trim()),
  })
}

/**
 * 论断这一级的关系播报。
 *
 * 默认返回空字符串（大多数 stance 不需要在论断上额外说一句话）。
 * `contradicts` 有，因为「逆流位置」是一个**纯视觉**信号——屏幕阅读器
 * 用户拿不到它，必须有一句话补上。
 */
export function relationAnnouncement(stance: Stance): string {
  return getRelationPresentation(stance).a11y.claimAnnouncement ?? ""
}

/** 参与证据强度的 stance。`context` 不在其中。 */
export function contributesToConfidence(stance: Stance): boolean {
  return getRelationPresentation(stance).confidenceRole !== "neutral"
}

/* -------------------------------------------------------------------------- */
/* 校验（测试与 fixture 共用）                                                    */
/* -------------------------------------------------------------------------- */

export interface RelationContractIssue {
  code: string
  message: string
}

/**
 * 校验一份契约注册表是否满足全部结构性要求。
 *
 * 导出它而不是把断言写死在测试里，是为了让**负例可以被真的跑**：
 * 测试可以喂一份故意的坏契约进去，断言它确实被拒绝。
 * 「缺一个 stance 会失败」这句话，只有在这种可执行的校验存在时才是真的。
 */
export function validateRelationContract(registry: Partial<RelationContract>): RelationContractIssue[] {
  const issues: RelationContractIssue[] = []

  for (const stance of ALL_STANCES) {
    if (!registry[stance]) {
      issues.push({
        code: "relation/missing-stance",
        message: `契约缺少 stance：${stance}`,
      })
    }
  }

  const present = ALL_STANCES.map((stance) => registry[stance]).filter(
    (entry): entry is RelationPresentation => entry !== undefined,
  )

  // 标签唯一。
  const labels = present.map((entry) => entry.label)
  if (new Set(labels).size !== labels.length) {
    issues.push({ code: "relation/duplicate-label", message: `label 有重复：${labels.join(", ")}` })
  }

  // 灰度可区分：不存在两个 stance 共享 (form, order)。
  const keys = present.map(grayscaleKey)
  if (new Set(keys).size !== keys.length) {
    issues.push({
      code: "relation/ambiguous-grayscale",
      message: `(form, order) 组合有重复，灰度下无法区分：${keys.join(", ")}`,
    })
  }

  for (const entry of present) {
    // 五通道完整性。
    if (!entry.label.trim()) {
      issues.push({ code: "relation/missing-label", message: `${entry.stance} 缺少 label` })
    }
    if (!entry.form) {
      issues.push({ code: "relation/missing-form", message: `${entry.stance} 缺少 form` })
    }
    if (!entry.lineStyle) {
      issues.push({ code: "relation/missing-line-style", message: `${entry.stance} 缺少 lineStyle` })
    }
    if (!entry.glyph) {
      issues.push({ code: "relation/missing-glyph", message: `${entry.stance} 缺少 glyph` })
    }
    if (!Number.isInteger(entry.order)) {
      issues.push({ code: "relation/missing-order", message: `${entry.stance} 缺少 order` })
    }

    // a11y 前缀必须与 label 逐字一致，否则可访问名里的词和屏幕上的词会对不上。
    if (entry.a11y.labelPrefix !== entry.label) {
      issues.push({
        code: "relation/a11y-prefix-mismatch",
        message: `${entry.stance} 的 a11y.labelPrefix（${entry.a11y.labelPrefix}）与 label（${entry.label}）不一致`,
      })
    }
    if (!entry.a11y.accessibleNameTemplate.includes("{label}")) {
      issues.push({
        code: "relation/a11y-template-missing-label",
        message: `${entry.stance} 的可访问名模板不含 {label}——关系词会被丢掉`,
      })
    }

    // 窄屏模板必须含 {label}：窄屏不画线，词是唯一载体。
    if (!entry.mobile.labelTemplate.includes("{label}")) {
      issues.push({
        code: "relation/mobile-template-missing-label",
        message: `${entry.stance} 的窄屏模板不含 {label}——窄屏将丢失语义`,
      })
    }

    // 交互契约。
    if (entry.interaction.primary !== "reveal-passage") {
      issues.push({
        code: "relation/bad-primary-action",
        message: `${entry.stance} 的主操作必须是 reveal-passage`,
      })
    }
    if (entry.interaction.navigation !== "inline") {
      issues.push({
        code: "relation/navigation-not-inline",
        message: `${entry.stance} 的导航必须是 inline——点击证据不得离开 Argument Chain`,
      })
    }
  }

  // contradicts 必须最优先。
  if (registry.contradicts && registry.contradicts.order !== 1) {
    issues.push({
      code: "relation/contradicts-not-first",
      message: `contradicts 的 order 必须是 1，实际是 ${registry.contradicts.order}`,
    })
  }

  return issues
}

/**
 * 校验一个**已生成**的可访问名是否保住了它的语义。
 *
 * 用于负例：把一个缺了 stance 词的名字喂进来，必须被拒绝。
 */
export function validateAccessibleName(
  name: string,
  input: { stance: Stance; locatorLabel: string; passageText: string },
): RelationContractIssue[] {
  const issues: RelationContractIssue[] = []
  const presentation = getRelationPresentation(input.stance)

  if (!name.includes(presentation.label)) {
    issues.push({
      code: "a11y/missing-stance-word",
      message: `可访问名不含 stance 词「${presentation.label}」：${name}`,
    })
  }
  if (input.locatorLabel && !name.includes(input.locatorLabel)) {
    issues.push({
      code: "a11y/missing-locator",
      message: `可访问名不含定位「${input.locatorLabel}」：${name}`,
    })
  }
  const probe = clampPassage(input.passageText.trim()).slice(0, 24)
  if (probe && !name.includes(probe)) {
    issues.push({
      code: "a11y/missing-passage",
      message: `可访问名不含原文片段：${name}`,
    })
  }

  return issues
}

/** 校验一个**已生成**的窄屏标签是否保住了语义词。 */
export function validateMobileLabel(
  label: string,
  input: { stance: Stance; locatorLabel: string },
): RelationContractIssue[] {
  const issues: RelationContractIssue[] = []
  const presentation = getRelationPresentation(input.stance)

  if (!label.includes(presentation.label)) {
    issues.push({
      code: "mobile/missing-stance-word",
      message: `窄屏标签不含 stance 词「${presentation.label}」：${label}`,
    })
  }
  if (input.locatorLabel && !label.includes(input.locatorLabel)) {
    issues.push({
      code: "mobile/missing-locator",
      message: `窄屏标签不含定位「${input.locatorLabel}」：${label}`,
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* Fixture                                                                      */
/* -------------------------------------------------------------------------- */

export interface RelationFixture {
  contractVersion: string
  /** 窄屏顺序：stance 的序列化排列。 */
  order: Stance[]
  /** 每个 stance 的完整序列化表达。 */
  stances: Record<string, RelationPresentation>
}

/** 把当前契约序列化成 fixture 形状（纯数据，可 `JSON.stringify`）。 */
export function serializeRelationContract(): RelationFixture {
  return {
    contractVersion: RELATION_CONTRACT_VERSION,
    order: [...ALL_STANCES],
    stances: Object.fromEntries(ALL_STANCES.map((stance) => [stance, RELATION_CONTRACT[stance]])),
  }
}

/**
 * 解析并校验一份 fixture。
 *
 * 未知 stance 会被拒绝，而不是被忽略——一份「多了一个我们不再认识的 stance」
 * 的 fixture 说明契约已经分叉，静默忽略只会让分叉继续存在。
 */
export function parseRelationFixture(raw: unknown): {
  ok: boolean
  issues: RelationContractIssue[]
  fixture?: RelationFixture
} {
  const issues: RelationContractIssue[] = []

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, issues: [{ code: "fixture/not-an-object", message: "fixture 不是对象" }] }
  }

  const candidate = raw as Partial<RelationFixture>

  if (typeof candidate.contractVersion !== "string") {
    issues.push({ code: "fixture/missing-version", message: "fixture 缺少 contractVersion" })
  }
  if (typeof candidate.stances !== "object" || candidate.stances === null) {
    return {
      ok: false,
      issues: [...issues, { code: "fixture/missing-stances", message: "fixture 缺少 stances" }],
    }
  }

  const known = new Set<string>(ALL_STANCES)
  for (const key of Object.keys(candidate.stances)) {
    if (!known.has(key)) {
      issues.push({
        code: "fixture/unknown-stance",
        message: `fixture 含未知 stance：${key}`,
      })
    }
  }

  issues.push(...validateRelationContract(candidate.stances as Partial<RelationContract>))

  return issues.length > 0 ? { ok: false, issues } : { ok: true, issues, fixture: candidate as RelationFixture }
}
