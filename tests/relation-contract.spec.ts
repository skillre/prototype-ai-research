import { test, expect } from "@playwright/test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  ALL_STANCES,
  RELATION_CONTRACT,
  RELATION_CONTRACT_VERSION,
  buildEvidenceAccessibleName,
  compareRelations,
  contributesToConfidence,
  formatRelationMobileLabel,
  getRelationPresentation,
  grayscaleKey,
  parseRelationFixture,
  relationAnnouncement,
  serializeRelationContract,
  validateAccessibleName,
  validateMobileLabel,
  validateRelationContract,
  type RelationContract,
  type RelationPresentation,
} from "../lib/research/relation-contract"
import type { Stance } from "../lib/research/types"
import { freshResearch } from "../lib/research/dataset"
import { deriveClaimConfidence } from "../lib/research/projections"

/**
 * Relation Presentation Contract —— 穷尽测试。
 *
 * ## 为什么需要这么多条
 *
 * 四个 stance 的语义分散在五个通道里（词 / 形 / 序 / 无障碍 / 窄屏降级）。
 * 只断言「四个 label 不同」几乎什么都没验证——颜色一去掉、线一消失，
 * 页面照样会退化。所以这里检查的是**通道之间的冗余是否真的存在**：
 * 灰度可区分、窄屏有词、无障碍名里有关系词。
 *
 * ## 负例是重点
 *
 * 每条关键规则都配一个坏输入，断言它**确实被拒绝**。
 * 校验函数之所以从实现里导出（而不是把断言写死在测试里），就是为了让这一点成立。
 */

const ROOT = process.cwd()
const CONTRACT_FILE = join(ROOT, "lib/research/relation-contract.ts")
const FIXTURE_FILE = join(ROOT, "tests/fixtures/relation-contract.json")

/** 剥掉注释再扫描——注释里出现「不要用 className」这样的说明不算违规。 */
function readCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const EXPECTED_STANCES: Stance[] = ["supports", "contradicts", "qualifies", "context"]

/* -------------------------------------------------------------------------- */
/* 1 · 四个 stance 全覆盖                                                        */
/* -------------------------------------------------------------------------- */

test.describe("1 · 全覆盖", () => {
  test("四个 stance 全部有表达", () => {
    for (const stance of EXPECTED_STANCES) {
      expect(RELATION_CONTRACT[stance], `缺少 ${stance}`).toBeDefined()
      expect(getRelationPresentation(stance).stance).toBe(stance)
    }
  })

  test("ALL_STANCES 与 Stance union 同步", () => {
    expect([...ALL_STANCES].sort()).toEqual([...EXPECTED_STANCES].sort())
    expect(ALL_STANCES).toHaveLength(4)
  })

  test("负例：缺一个 stance 的契约被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    delete broken.qualifies

    const issues = validateRelationContract(broken)
    expect(issues.map((i) => i.code)).toContain("relation/missing-stance")
    expect(issues.some((i) => i.message.includes("qualifies"))).toBe(true)
  })

  test("负例：多余一个未知 stance 也会被 fixture 解析拒绝", () => {
    const raw = { ...serializeRelationContract() }
    raw.stances = { ...raw.stances, speculation: RELATION_CONTRACT.supports }

    const result = parseRelationFixture(raw)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain("fixture/unknown-stance")
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 没有静默 fallback                                                        */
/* -------------------------------------------------------------------------- */

test.describe("2 · no default fallback", () => {
  test("未知 stance 抛错，而不是退回某个默认关系", () => {
    // 静默回退的后果很具体：新 stance 会被当成 supports 渲染，且不报错。
    expect(() => getRelationPresentation("speculation" as Stance)).toThrow(/未知 stance/)
  })

  test("源文件里有穷尽性断言（never），不是 `default: return`", () => {
    const code = readCode(CONTRACT_FILE)
    expect(code).toContain("const exhaustive: never = stance")
    // 不允许 `default:` 后面直接返回一个具体 stance 的表达。
    expect(code).not.toMatch(/default:\s*return\s+RELATION_CONTRACT\./)
    expect(code).not.toMatch(/default:\s*return\s+getRelationPresentation/)
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 五通道完整性                                                             */
/* -------------------------------------------------------------------------- */

test.describe("3 · 五通道完整性", () => {
  test("每个 stance 同时具备 词 / 形 / 序 / 语义 / 窄屏降级", () => {
    for (const stance of EXPECTED_STANCES) {
      const p = getRelationPresentation(stance)

      expect(p.label.trim(), `${stance} 缺词`).not.toBe("")
      expect(p.form, `${stance} 缺形状`).toBeTruthy()
      expect(Number.isInteger(p.order), `${stance} 缺顺序`).toBe(true)
      expect(p.glyph, `${stance} 缺辅助符号`).toBeTruthy()
      expect(p.lineStyle, `${stance} 缺线型描述`).toBeTruthy()
      expect(p.confidenceRole, `${stance} 缺置信度角色`).toBeTruthy()
      expect(p.interaction.primary, `${stance} 缺主操作`).toBeTruthy()
      expect(p.interaction.navigation, `${stance} 缺导航方式`).toBeTruthy()
      expect(p.a11y.labelPrefix, `${stance} 缺 a11y 前缀`).toBeTruthy()
      expect(p.a11y.accessibleNameTemplate, `${stance} 缺可访问名模板`).toBeTruthy()
      expect(p.mobile.labelTemplate, `${stance} 缺窄屏模板`).toBeTruthy()
    }
  })

  test("a11y 前缀与屏幕上显示的词逐字一致", () => {
    for (const stance of EXPECTED_STANCES) {
      const p = getRelationPresentation(stance)
      expect(p.a11y.labelPrefix).toBe(p.label)
    }
  })

  test("负例：破坏一个通道会被契约校验拒绝", () => {
    const broken = serializeRelationContract().stances as Partial<RelationContract>
    broken.context = { ...RELATION_CONTRACT.context, form: "" as RelationPresentation["form"] }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/missing-form")
    // 注意：空 form **不会**同时触发灰度冲突。`:4` 仍然是唯一的键——
    // 灰度冲突要求两个 stance 落在同一个 (form, order) 组合上，
    // 而不是要求 form 非空。这两件事由不同的检查负责，不能混为一谈。
    expect(codes).not.toContain("relation/ambiguous-grayscale")
  })

  test("负例：把两个 stance 的 (form, order) 撞在一起才会触发灰度冲突", () => {
    const broken = serializeRelationContract().stances as Partial<RelationContract>
    broken.qualifies = {
      ...RELATION_CONTRACT.qualifies,
      form: RELATION_CONTRACT.context.form,
      order: RELATION_CONTRACT.context.order,
    }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/ambiguous-grayscale")
    expect(codes).not.toContain("relation/missing-form")
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · label 全不同                                                             */
/* -------------------------------------------------------------------------- */

test.describe("4 · label", () => {
  test("四个中文词互不相同且非空", () => {
    const labels = EXPECTED_STANCES.map((s) => getRelationPresentation(s).label)
    expect(new Set(labels).size).toBe(4)
    expect(labels.every((l) => l.trim().length > 0)).toBe(true)
    expect(labels).toEqual(["支持", "反驳", "限定", "背景"])
  })

  test("负例：两个 stance 用同一个 label 会被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.qualifies = { ...RELATION_CONTRACT.qualifies, label: "支持", a11y: { ...RELATION_CONTRACT.qualifies.a11y, labelPrefix: "支持" } }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/duplicate-label")
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · (form, order) 灰度唯一                                                    */
/* -------------------------------------------------------------------------- */

test.describe("5 · 灰度可区分", () => {
  test("不存在两个 stance 共享 (form, order)", () => {
    const keys = EXPECTED_STANCES.map((s) => grayscaleKey(getRelationPresentation(s)))
    expect(new Set(keys).size).toBe(4)
    expect(keys).toEqual([
      "solid-attached:2",
      "reverse-arrow:1",
      "notched:3",
      "recessed:4",
    ])
  })

  test("负例：两个 stance 共用 (form, order) 会被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.qualifies = {
      ...RELATION_CONTRACT.qualifies,
      form: RELATION_CONTRACT.context.form,
      order: RELATION_CONTRACT.context.order,
    }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/ambiguous-grayscale")
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · contradicts 最优先                                                       */
/* -------------------------------------------------------------------------- */

test.describe("6 · 反驳最优先", () => {
  test("contradicts 的 order 是 1", () => {
    // order 现在是**朗读顺序与视觉顺序共用的唯一事实**——
    // 曾经还有一个 a11y.priority 被强制等于它，那是重复事实来源，已删除。
    expect(getRelationPresentation("contradicts").order).toBe(1)
  })

  test("按 order 排序后 contradicts 确实排在最前", () => {
    const sorted = EXPECTED_STANCES.map((s) => getRelationPresentation(s)).sort(compareRelations)
    expect(sorted.map((p) => p.stance)).toEqual(["contradicts", "supports", "qualifies", "context"])
  })

  test("负例：把 contradicts 挪到后面会被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.contradicts = { ...RELATION_CONTRACT.contradicts, order: 3 }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/contradicts-not-first")
  })
})

/* -------------------------------------------------------------------------- */
/* 7 · 窄屏降级                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("7 · mobile fallback", () => {
  const LOCATOR = "第 4 页第 2 段"

  test("窄屏标签始终含 stance 词与定位", () => {
    for (const stance of EXPECTED_STANCES) {
      const label = formatRelationMobileLabel(stance, LOCATOR)
      expect(label).toContain(getRelationPresentation(stance).label)
      expect(label).toContain(LOCATOR)
      expect(validateMobileLabel(label, { stance, locatorLabel: LOCATOR })).toEqual([])
    }
  })

  test("窄屏标签的形状就是「词 · 定位」", () => {
    expect(formatRelationMobileLabel("contradicts", LOCATOR)).toBe("反驳 · 第 4 页第 2 段")
    expect(formatRelationMobileLabel("supports", LOCATOR)).toBe("支持 · 第 4 页第 2 段")
    expect(formatRelationMobileLabel("context", LOCATOR)).toBe("背景 · 第 4 页第 2 段")
  })

  test("窄屏契约只描述语义，不描述画什么", () => {
    // 这里曾经断言 showsConnector —— 那是一个 layout 决策被写进了语义层。
    // 现在窄屏只保证三件事：词、序、分组。
    for (const stance of EXPECTED_STANCES) {
      const mobile = getRelationPresentation(stance).mobile
      expect(Object.keys(mobile).sort()).toEqual(["labelTemplate"])
      expect(mobile.labelTemplate).toContain("{label}")
    }
  })

  test("负例：窄屏标签缺语义词会被拒绝", () => {
    const broken = "第 4 页第 2 段" // 丢了 stance 词
    const issues = validateMobileLabel(broken, { stance: "contradicts", locatorLabel: LOCATOR })
    expect(issues.map((i) => i.code)).toContain("mobile/missing-stance-word")
  })

  test("负例：模板本身不含 {label} 会被契约校验拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.context = { ...RELATION_CONTRACT.context, mobile: { ...RELATION_CONTRACT.context.mobile, labelTemplate: "{locator}" } }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/mobile-template-missing-label")
  })
})

/* -------------------------------------------------------------------------- */
/* 8 · 可访问名                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("8 · a11y contract", () => {
  const LOCATOR = "第 4 页第 2 段"
  const TEXT = "两条产线已于 2025 年四季度完成爬坡并进入稳定量产阶段。"

  test("a11y 契约不再携带 priority —— 读序与视序共用 order", () => {
    // priority 曾经被强制等于 order，那是重复事实来源：两个字段表达同一件事，
    // 而校验在保证它们不漂移。删掉字段才是让漂移不可能发生。
    for (const stance of EXPECTED_STANCES) {
      const a11y = getRelationPresentation(stance).a11y
      expect(Object.keys(a11y).sort()).toEqual(
        stance === "contradicts"
          ? ["accessibleNameTemplate", "claimAnnouncement", "labelPrefix"]
          : ["accessibleNameTemplate", "labelPrefix"],
      )
      expect(a11y).not.toHaveProperty("priority")
    }
  })

  test("可访问名始终含 stance 词 + 定位 + 原文", () => {
    for (const stance of EXPECTED_STANCES) {
      const name = buildEvidenceAccessibleName(stance, LOCATOR, TEXT)
      expect(name).toContain(getRelationPresentation(stance).label)
      expect(name).toContain(LOCATOR)
      expect(name).toContain("原文：")
      expect(validateAccessibleName(name, { stance, locatorLabel: LOCATOR, passageText: TEXT })).toEqual([])
    }
  })

  test("具体形状", () => {
    expect(buildEvidenceAccessibleName("contradicts", LOCATOR, TEXT)).toBe(
      `反驳 · ${LOCATOR} · 原文：${TEXT}`,
    )
  })

  test("长原文被截断时，关系词与定位必须保留", () => {
    const longText = "很长的原文。".repeat(100)
    const name = buildEvidenceAccessibleName("qualifies", LOCATOR, longText)

    expect(name).toContain("限定")
    expect(name).toContain(LOCATOR)
    expect(name).toContain("…")
    expect(name.length).toBeLessThan(longText.length)
    expect(
      validateAccessibleName(name, { stance: "qualifies", locatorLabel: LOCATOR, passageText: longText }),
    ).toEqual([])
  })

  test("负例：缺 stance 词的可访问名会被拒绝", () => {
    const broken = `第 4 页第 2 段 · 原文：${TEXT}`
    const issues = validateAccessibleName(broken, { stance: "contradicts", locatorLabel: LOCATOR, passageText: TEXT })
    expect(issues.map((i) => i.code)).toContain("a11y/missing-stance-word")
  })

  test("负例：缺定位的可访问名会被拒绝", () => {
    const broken = `支持 · 原文：${TEXT}`
    const issues = validateAccessibleName(broken, { stance: "supports", locatorLabel: LOCATOR, passageText: TEXT })
    expect(issues.map((i) => i.code)).toContain("a11y/missing-locator")
  })

  test("负例：模板不含 {label} 会被契约校验拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.supports = { ...RELATION_CONTRACT.supports, a11y: { ...RELATION_CONTRACT.supports.a11y, accessibleNameTemplate: "{locator} · 原文：{text}" } }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/a11y-template-missing-label")
  })
})

/* -------------------------------------------------------------------------- */
/* 9 · contradiction special contract                                           */
/* -------------------------------------------------------------------------- */

test.describe("9 · contradiction special contract", () => {
  test("contradiction announcement 非空，其余 stance 为空", () => {
    expect(relationAnnouncement("contradicts").trim()).not.toBe("")
    for (const stance of ["supports", "qualifies", "context"] as const) {
      expect(relationAnnouncement(stance)).toBe("")
    }
  })

  test("announcement 是纯文本，不含任何图形或颜色指示", () => {
    const announcement = relationAnnouncement("contradicts")
    expect(announcement).toContain("反驳")
    expect(announcement).not.toMatch(/[🎨●▲■#]/)
  })

  test("领域层的 hasContradiction 不被这里重新实现（只消费）", () => {
    // 契约声明顺序，领域层计算事实。把两者混在一起就会出现第二份判定逻辑。
    const data = freshResearch()
    const contested = "clm-yield-advantage"

    // 契约说：contradicts 最优先。
    expect(getRelationPresentation("contradicts").order).toBe(1)
    // 领域层说：这条论断确实有反驳证据。
    const hasContradiction = data.links.some(
      (link) => link.claimId === contested && link.stance === "contradicts" && link.retiredAt === null,
    )
    expect(hasContradiction).toBe(true)

    // 而契约文件里不出现任何数据扫描（不 import dataset / projections）。
    const code = readCode(CONTRACT_FILE)
    expect(code).not.toContain("from \"./dataset\"")
    expect(code).not.toContain("from \"./projections\"")
  })
})

/* -------------------------------------------------------------------------- */
/* 10 · confidenceRole                                                          */
/* -------------------------------------------------------------------------- */

test.describe("10 · confidenceRole", () => {
  test("四个角色各就各位", () => {
    expect(getRelationPresentation("supports").confidenceRole).toBe("supporting")
    expect(getRelationPresentation("contradicts").confidenceRole).toBe("counter")
    expect(getRelationPresentation("qualifies").confidenceRole).toBe("limiting")
    expect(getRelationPresentation("context").confidenceRole).toBe("neutral")
  })

  test("context 不参与证据强度，其余参与", () => {
    expect(contributesToConfidence("context")).toBe(false)
    expect(contributesToConfidence("supports")).toBe(true)
    expect(contributesToConfidence("contradicts")).toBe(true)
    expect(contributesToConfidence("qualifies")).toBe(true)
  })

  test("已知缺口：qualifies 的 limiting 目前是 declared semantic，没有被消费", () => {
    // 这条测试记录的是一个**已知的不一致**，不是一件已完成的事。
    //
    // 契约声明 qualifies 参与证据强度，但领域层的 deriveClaimConfidence()
    // 当前只读 supports。qualifies 对强度**没有实际影响**。
    //
    // 把它断言下来，是为了让这个缺口在补上限定逻辑的那一刻**立刻暴露**：
    // 届时这条测试会失败，逼着人把契约注释、领域规则、以及新测试一起更新，
    // 而不是让文档继续宣称一个不存在的规则。
    const data = freshResearch()
    const claim = "clm-capacity-crossed" // 夹具里唯一带 qualifies 链接的论断

    const hasQualifies = data.links.some(
      (link) => link.claimId === claim && link.stance === "qualifies" && link.retiredAt === null,
    )
    expect(hasQualifies, "夹具必须保留一条 qualifies 链接，否则这条缺口测试没被覆盖").toBe(true)

    const withQualifies = deriveClaimConfidence(data, claim)
    const withoutQualifies = deriveClaimConfidence(
      { ...data, links: data.links.filter((l) => !(l.claimId === claim && l.stance === "qualifies")) },
      claim,
    )
    // 去掉 qualifies 之后强度不变 = 它当前确实没有被消费。
    expect(withoutQualifies).toBe(withQualifies)
  })

  test("用四值而不是 boolean —— 限定与反驳不能压成同一个 false", () => {
    const roles = EXPECTED_STANCES.map((s) => getRelationPresentation(s).confidenceRole)
    expect(new Set(roles).size).toBe(4)
  })
})

/* -------------------------------------------------------------------------- */
/* 11 · interaction contract                                                    */
/* -------------------------------------------------------------------------- */

test.describe("11 · interaction contract", () => {
  test("每条证据的主操作是 reveal-passage", () => {
    for (const stance of EXPECTED_STANCES) {
      expect(getRelationPresentation(stance).interaction.primary).toBe("reveal-passage")
    }
  })

  test("导航方式一律 inline —— 点击证据不得离开 Argument Chain", () => {
    for (const stance of EXPECTED_STANCES) {
      expect(getRelationPresentation(stance).interaction.navigation).toBe("inline")
    }
  })

  test("负例：navigation 不是 inline 会被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.supports = {
      ...RELATION_CONTRACT.supports,
      interaction: { primary: "reveal-passage", navigation: "navigate-away" as never },
    }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/navigation-not-inline")
  })

  test("负例：主操作不是 reveal-passage 会被拒绝", () => {
    const broken = { ...RELATION_CONTRACT } as Partial<RelationContract>
    broken.context = {
      ...RELATION_CONTRACT.context,
      interaction: { primary: "open-in-new-tab" as never, navigation: "inline" },
    }

    const codes = validateRelationContract(broken).map((i) => i.code)
    expect(codes).toContain("relation/bad-primary-action")
  })
})

/* -------------------------------------------------------------------------- */
/* 12 · fixture                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("12 · fixture", () => {
  const raw = JSON.parse(readFileSync(FIXTURE_FILE, "utf8"))

  test("fixture 可解析且完整", () => {
    const result = parseRelationFixture(raw)
    expect(result.ok, JSON.stringify(result.issues)).toBe(true)
    expect(Object.keys(result.fixture?.stances ?? {})).toHaveLength(4)
  })

  test("fixture 覆盖四个 stance", () => {
    for (const stance of EXPECTED_STANCES) {
      expect(raw.stances[stance], `fixture 缺 ${stance}`).toBeDefined()
    }
    expect(raw.order).toEqual([...ALL_STANCES])
  })

  test("fixture 与实现逐字一致（防漂移）", () => {
    // fixture 是冻结的接口。实现改了而 fixture 没改 = 契约已经变化，
    // 必须显式重新生成，而不是让两者静默分叉。
    expect(raw).toEqual(serializeRelationContract())
    expect(raw.contractVersion).toBe(RELATION_CONTRACT_VERSION)
  })

  test("fixture 是纯数据的（可 JSON 往返）", () => {
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw)
  })

  test("负例：fixture 含未知 stance 会被拒绝", () => {
    const broken = { ...raw, stances: { ...raw.stances, hypothesis: raw.stances.supports } }
    const result = parseRelationFixture(broken)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain("fixture/unknown-stance")
  })

  test("负例：fixture 缺 stance 会被拒绝", () => {
    const stances = { ...raw.stances }
    delete stances.qualifies
    const result = parseRelationFixture({ ...raw, stances })
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain("relation/missing-stance")
  })

  test("负例：非对象输入被拒绝", () => {
    expect(parseRelationFixture(null).ok).toBe(false)
    expect(parseRelationFixture("nope").ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 13 · 契约不绑定实现细节                                                       */
/* -------------------------------------------------------------------------- */

test.describe("13 · 无实现细节泄漏", () => {
  test("没有 React 依赖", () => {
    const code = readCode(CONTRACT_FILE)
    expect(code).not.toMatch(/from\s+["']react["']/)
    expect(code).not.toMatch(/require\(\s*["']react["']\s*\)/)
    expect(code).not.toContain("useState")
    expect(code).not.toContain("JSX")
    // 唯一的 import 必须是 type-only，否则运行时擦除就不成立。
    const imports = code.match(/^import .*$/gm) ?? []
    expect(imports).toHaveLength(1)
    expect(imports[0]).toContain("import type")
  })

  test("没有 CSS / Tailwind class / 颜色值", () => {
    const code = readCode(CONTRACT_FILE)
    expect(code).not.toContain("className")
    expect(code).not.toMatch(/border-red|text-red|bg-red|border-\[/)
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).not.toMatch(/\boklch\(|\brgb\(a?\(|\bhsl\(/)
    expect(code).not.toMatch(/\bpx\b|\brem\b/)
    expect(code).not.toMatch(/--[a-z-]+:/)
  })

  test("没有 Kits asset id（含 pack 名与签名组件名）", () => {
    const code = readCode(CONTRACT_FILE)
    const KITS_IDS = [
      "cinematic",
      "editorial",
      "instrument",
      "interactive-hero",
      "spotlight-surface",
      "animated-grid",
      "data-cursor",
      "insight-reveal",
      "paper-grain",
      "ambient-glow",
      "scanline-sweep",
    ]
    for (const id of KITS_IDS) {
      expect(code, `契约里出现了 Kits asset id: ${id}`).not.toContain(id)
    }
  })

  test("没有绑定图标库", () => {
    const code = readCode(CONTRACT_FILE)
    expect(code).not.toMatch(/from\s+["']lucide-react["']/)
    expect(code).not.toContain("Icon")
    // glyph 是语义 token，不是图标名。
    for (const stance of EXPECTED_STANCES) {
      expect(getRelationPresentation(stance).glyph).toMatch(/-mark$/)
    }
  })

  test("没有第二套关系模型", () => {
    const code = readCode(CONTRACT_FILE)
    for (const forbidden of ["ClaimRelation", "GraphEdge", "RelationNode", "ClaimEdge"]) {
      expect(code, `出现了第二套关系模型：${forbidden}`).not.toContain(forbidden)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 14 · UI 只能消费契约，不能各自重新判断 stance                                  */
/* -------------------------------------------------------------------------- */

test.describe("14 · 契约是唯一消费入口", () => {
  /**
   * 这一条目前**必然通过**——因为还没有 UI。
   *
   * 它的价值在将来：Phase D 写 ArgumentChain 时，如果有人写下
   * `stance === "contradicts"`，这个测试会失败。契约的意义就是让这种判断
   * 收敛到一处；散落的分支会漂移，而漂移时不会有任何东西报错。
   */
  test("app/ 与 components/ 里没有对 stance 字面量的分支判断", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry)) files.push(full)
      }
    }
    walk(join(ROOT, "app"))
    walk(join(ROOT, "components"))

    const offenders: string[] = []
    for (const file of files) {
      const code = readCode(file)
      for (const stance of EXPECTED_STANCES) {
        const pattern = new RegExp(`stance\\s*===?\\s*["']${stance}["']`)
        if (pattern.test(code)) offenders.push(`${file}: stance === "${stance}"`)
      }
    }

    expect(
      offenders,
      "UI 不得自行判断 stance —— 必须消费 getRelationPresentation()",
    ).toEqual([])
  })
})
