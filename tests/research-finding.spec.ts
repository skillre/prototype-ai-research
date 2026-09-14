import { test, expect, type Page } from "@playwright/test"

import {
  dispositionTension,
  addEvidenceLink,
  loadBearingResearch,
  mayEnterFinding,
  projectFindingDraft,
  projectKnownLimitations,
  validateFinding,
  type Finding,
  type ResearchData,
} from "../lib/research"
import { messages } from "../lib/i18n"

/**
 * Phase G+H —— Finding（交付物）。
 *
 * 这一页与工作区的区别是它的全部意义所在：
 *
 * ```
 * 工作区    活的。每次处置都重算，屏幕上永远是最新状态。
 * Finding   定稿的**措辞**。稳定、可分享、可引用，带定稿日期。
 * ```
 *
 * 它不是 dashboard summary。这个 spec 里有一整组断言专门防它退化成那个样子。
 */

const ROUTE = "/r/res-load-bearing/finding"
const WORKSPACE = "/r/res-load-bearing"

const FINDING = loadBearingResearch.findings[0]!
const draft = projectFindingDraft(loadBearingResearch, FINDING)

const t = messages.research.finding

async function gotoFinding(page: Page) {
  await page.goto(ROUTE)
  await expect(page.getByTestId("finding-view")).toBeVisible()
}

/* -------------------------------------------------------------------------- */
/* 1 · 路由                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Finding · 路由", () => {
  test("路由存在，并且带着交付物的八个要素", async ({ page }) => {
    await gotoFinding(page)

    // 1 研究问题  2 正文  3 confidence  4 supporting claims
    // 5 citations  6 known limitations  7 scope  8 generated-at / state
    await expect(page.locator(".rs-finding__question")).toHaveText(draft.question)
    await expect(page.locator(".rs-finding__body")).toHaveText(FINDING.text)
    await expect(page.getByTestId("finding-confidence")).toBeVisible()
    await expect(page.locator(".rs-finding__claim")).toHaveCount(draft.supportingClaims.length)
    await expect(page.locator(".rs-finding__citation")).toHaveCount(draft.citations.length)
    await expect(page.locator(".rs-finding__limitation")).toHaveCount(FINDING.knownLimitations.length)
    await expect(page.locator(".rs-finding__scope-item").first()).toBeVisible()
    await expect(page.locator(".rs-finding__envelope")).toContainText(
      FINDING.generatedAt.slice(0, 10),
    )
  })

  test("它说清了自己是定稿，不是工作区的实时视图", async ({ page }) => {
    await gotoFinding(page)
    await expect(page.locator(".rs-finding__note")).toHaveText(t.note)
    // 并且有一条回到研究现场的路——交付物不该是死胡同。
    await expect(page.getByTestId("back-to-workspace")).toHaveAttribute("href", WORKSPACE)
  })

  test("从工作区可以走到它：窄带底部的交付物入口", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(WORKSPACE)
    await expect(page.getByTestId("research-shell")).toBeVisible()

    const entry = page.locator(".rs-rail-desktop").getByTestId("open-finding")
    await expect(entry).toBeVisible()
    await expect(entry).toHaveAttribute("href", ROUTE)
    await entry.click()
    await page.waitForURL(`**${ROUTE}`)
    await expect(page.getByTestId("finding-view")).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 置信度：只读，且越界时必须报错                                              */
/* -------------------------------------------------------------------------- */

test.describe("Finding · 置信度契约", () => {
  test("页面显示声明值与上限两个数——不是一个合并后的数", async ({ page }) => {
    await gotoFinding(page)
    const box = page.getByTestId("finding-confidence")
    await expect(box.locator("[data-declared]")).toHaveText(String(FINDING.confidence))
    await expect(box.locator("[data-ceiling]")).toContainText(String(draft.ceiling))
  })

  test("夹具里的声明值在上限以内，页面不报契约失败", async ({ page }) => {
    await gotoFinding(page)
    expect(draft.contractOk).toBe(true)
    await expect(page.getByTestId("finding-contract-failure")).toHaveCount(0)
  })

  test("页面**不重算**置信度：屏幕上那两个数就是领域层的那两个", async ({ page }) => {
    await gotoFinding(page)
    const declared = await page.locator("[data-declared]").getAttribute("data-declared")
    const ceiling = await page.locator("[data-ceiling]").getAttribute("data-ceiling")
    expect(Number(declared)).toBe(FINDING.confidence)
    expect(Number(ceiling)).toBe(draft.ceiling)
    // 上限来自「最弱的一环」，页面把那条论断指了出来。
    const weakest = loadBearingResearch.claims.find((claim) => claim.id === draft.weakestClaimId)
    if (weakest) await expect(page.getByTestId("weakest-claim")).toHaveCount(1)
  })

  test("负例：把声明值抬到上限之上 → 页面必须显式报错，不得静默修正", () => {
    const inflated: Finding = { ...FINDING, confidence: 4 }
    const issues = validateFinding(loadBearingResearch, inflated)
    expect(issues.map((issue) => issue.code)).toContain("finding/confidence-exceeds-ceiling")
    // 而且它**没有**把 4 改成 2 —— 契约失败必须被说出来。
    expect(projectFindingDraft(loadBearingResearch, inflated).declaredConfidence).toBe(4)
    expect(projectFindingDraft(loadBearingResearch, inflated).contractOk).toBe(false)
  })

  test("负例：把某条被引用论断的证据撤掉 → 上限下降，原声明值立刻越界", () => {
    /* 这条证明上限**是活的**：它不是写死在 Finding 上的一个数。 */
    const data = structuredClone(loadBearingResearch)
    for (const link of data.links) {
      if (link.claimId === "clm-utilization-recovery" && link.retiredAt === null) {
        link.retiredAt = "2026-09-12T10:00:00+08:00"
      }
    }
    const after = projectFindingDraft(data, FINDING)
    expect(after.ceiling).toBeLessThan(draft.ceiling)
    expect(after.contractOk).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 引用与依据                                                                */
/* -------------------------------------------------------------------------- */

test.describe("Finding · 依据与引用", () => {
  test("每条引用落点是**片段**，带着定位与所属来源", () => {
    for (const citation of draft.citations) {
      const passage = loadBearingResearch.passages.find((p) => p.id === citation.passageId)
      expect(passage, `${citation.passageId} 必须真实存在`).toBeDefined()
      expect(citation.passageText).toBe(passage!.text)
      expect(Object.keys(citation.locator).length).toBeGreaterThan(0)
    }
  })

  test("引用全部可核对时页面不报警；有不可核对的引用时**明说**", async ({ page }) => {
    await gotoFinding(page)
    if (draft.unverifiableCitationCount === 0) {
      await expect(page.getByTestId("unverifiable-citations")).toHaveCount(0)
    } else {
      await expect(page.getByTestId("unverifiable-citations")).toContainText(
        String(draft.unverifiableCitationCount),
      )
    }
  })

  test("关系词来自契约，且与工作区同一套", async ({ page }) => {
    await gotoFinding(page)
    const words = await page
      .locator(".rs-finding__citation-stance")
      .evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    expect(words.length).toBeGreaterThan(0)
    for (const word of words) {
      expect(["反驳", "支持", "限定", "背景"]).toContain(word)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · 已知局限 vs 已解决：必须一眼不同                                            */
/* -------------------------------------------------------------------------- */

test.describe("Finding · 边界", () => {
  test("已知局限是交付物的一部分，并且说清它仍然存在", async ({ page }) => {
    await gotoFinding(page)
    const section = page.locator("#rs-finding-limitations").locator("..")
    await expect(section).toContainText(t.limitationsNote)
    await expect(page.locator(".rs-finding__limitation").first()).toBeVisible()
  })

  test("已解决在**另一段**，措辞与局限不同", async ({ page }) => {
    await gotoFinding(page)
    await expect(page.locator("#rs-finding-resolved")).toHaveText(
      new RegExp(`${t.resolvedLabel}${draft.resolvedCount}`),
    )
    await expect(page.getByTestId("resolved-count")).toHaveText(t.resolvedNote)
    // 两者必须说不同的话：合成一句「已处理」正是这一整条路线要防的事。
    expect(t.limitationsNote).not.toBe(t.resolvedNote)
    expect(t.limitationsLabel).not.toBe(t.resolvedLabel)
  })

  test("交付物的措辞来自 Finding 自己，不是 disposition reason 的复制", () => {
    expect(FINDING.knownLimitations).toHaveLength(3)
    const accepted = projectKnownLimitations(loadBearingResearch)
    expect(accepted).toHaveLength(1)

    /* 只有一条边界**声称**对那条处置负责（refs 是显式的、位置对应的）。
       另外两条是手写的判断——它们不来自任何处置。 */
    expect(FINDING.knownLimitationRefs.filter(Boolean)).toHaveLength(1)
    expect(draft.limitations.filter((l) => l.ref !== null)).toHaveLength(1)
    expect(draft.limitations.filter((l) => l.ref === null)).toHaveLength(2)

    // 三条措辞里**没有一条**等于处置理由的原文——没有被自动倒进来。
    const reason = accepted[0]!.reason
    for (const wording of FINDING.knownLimitations) {
      expect(wording).not.toBe(reason)
    }
  })

  test("已接受但没写进交付物的局限，在这里只作为**候选**出现", async ({ page }) => {
    await gotoFinding(page)
    /* 夹具里那条唯一被接受的局限**已经**写进交付物了，所以候选是空的。
       它必须明说这一点，而不是渲染一段空白。 */
    expect(draft.candidates).toHaveLength(0)
    await expect(page.getByTestId("no-candidates")).toHaveText(t.candidatesNone)
    await expect(page.locator(".rs-finding__candidate")).toHaveCount(0)
  })

  test("负例：新接受一条局限之后，它出现在候选里，而**没有**自动进入正文", () => {
    /* 走真实操作路径造出「已接受但未写进交付物」这个状态，
       而不是手写一个 fixture——那正是 §12 要防的事。 */
    const data = structuredClone(loadBearingResearch)
    const outcome = dispositionTension(
      data,
      "low-quality-evidence::clm-cost-scale",
      "accepted-as-limitation",
      {
        actor: "human",
        at: "2026-09-12T10:00:00+08:00",
        reason: "手上一时拿不到一手成本数据，先带着这条边界交付。",
      },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const after: ResearchData = outcome.data
    const withCandidate = projectFindingDraft(after, FINDING)
    expect(withCandidate.candidates).toHaveLength(1)
    expect(withCandidate.candidates[0]!.dispositionReason).toContain("先带着这条边界交付")

    // 交付物的措辞**一个字都没变** —— 候选没有被自动写进去。
    expect(withCandidate.finding.knownLimitations).toEqual(FINDING.knownLimitations)
    expect(withCandidate.limitations).toHaveLength(3)
  })

  test("负例：交付物里写着一条**已经不成立**的边界 → 必须被标出来", () => {
    /* 场景：那条「只有单一券商报告」的局限被接受了，交付物也写了它；
       然后研究者补了第二份独立来源 —— 那条边界就不成立了，
       而交付物还挂着一句关于它的限制。这是交付物与事实之间最需要
       被看见的一种分叉。 */
    const data = structuredClone(loadBearingResearch)
    const outcome = addEvidenceLink(
      data,
      { claimId: "clm-utilization-recovery", passageId: "psg-association-utilization", stance: "supports" },
      { actor: "human", at: "2026-09-12T10:00:00+08:00", reason: "补一份独立来源。" },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const after = projectFindingDraft(outcome.data, FINDING)
    const tracked = after.limitations.filter((limitation) => limitation.ref !== null)
    expect(tracked).toHaveLength(1)
    expect(tracked[0]!.overstated, "事实变了，交付物里的边界就成了夸大").toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · AI：建议永远进不来                                                        */
/* -------------------------------------------------------------------------- */

test.describe("Finding · AI 准入", () => {
  test("建议不进页面：没有任何一条建议的文本出现在交付物里", async ({ page }) => {
    await gotoFinding(page)
    const body = await page.locator("main").innerText()
    for (const output of loadBearingResearch.aiOutputs) {
      if (output.kind !== "suggestion") continue
      expect(mayEnterFinding(output)).toBe(false)
      expect(body, `AI 建议「${output.text}」不该出现在交付物里`).not.toContain(output.text)
    }
  })

  test("被挡在外面的建议只以一个**计数**出现", async ({ page }) => {
    await gotoFinding(page)
    await expect(page.getByTestId("excluded-suggestions")).toContainText(String(draft.excludedCount))
    expect(draft.excludedCount).toBeGreaterThan(0)
  })

  test("只有 Passage-backed 的抽取事实能作为候选材料", async ({ page }) => {
    await gotoFinding(page)
    for (const candidate of draft.aiCandidates) {
      expect(candidate.kind).toBe("factual")
      expect(candidate.passageIds.length).toBeGreaterThanOrEqual(1)
      for (const passageId of candidate.passageIds) {
        expect(loadBearingResearch.passages.some((p) => p.id === passageId)).toBe(true)
      }
    }
    await expect(page.locator(".rs-finding__ai-row")).toHaveCount(draft.aiCandidates.length)
    await expect(page.locator(".rs-finding__ai-statement").first()).toBeVisible()
  })

  test("负例：把建议的文本写进交付物正文 → 数据侧校验必须失败", () => {
    const suggestion = loadBearingResearch.aiOutputs.find((o) => o.kind === "suggestion")!
    const leaked: Finding = {
      ...FINDING,
      text: `${FINDING.text} ${suggestion.text}`,
    }
    expect(validateFinding(loadBearingResearch, leaked).map((i) => i.code)).toContain(
      "finding/suggestion-leaked",
    )
  })

  test("页面里没有任何聊天输入或发送控件", async ({ page }) => {
    await gotoFinding(page)
    expect(await page.locator('main input[type="text"], main input[type="search"]').count()).toBe(0)
    expect(await page.locator("main textarea").count()).toBe(0)
    expect(await page.locator("main [contenteditable]").count()).toBe(0)
    const labels = await page.locator("main button").evaluateAll((els) =>
      els.map((el) => el.textContent ?? ""),
    )
    for (const label of labels) {
      expect(label).not.toMatch(/发送|提问|问 AI|Ask/i)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · 它不是 dashboard                                                          */
/* -------------------------------------------------------------------------- */

test.describe("Finding · 不是 dashboard", () => {
  test("没有图表、没有 KPI、没有卡片网格", async ({ page }) => {
    await gotoFinding(page)
    expect(await page.locator("svg.recharts-surface").count()).toBe(0)
    expect(await page.locator('[role="progressbar"]').count()).toBe(0)
    expect(await page.locator(".text-metric, .kits-data").count()).toBe(0)
    expect(await page.locator('[class*="grid-cols-"]').count()).toBe(0)
    // 交付物是**文档**：一条 hairline 分节，没有圆角盒子的堆叠。
    expect(await page.locator("main .rs-finding__section").count()).toBeGreaterThan(3)
  })

  test("未处理缺口在交付物里只是**一句说明 + 计数**，不是待办清单", async ({ page }) => {
    await gotoFinding(page)
    await expect(page.locator("#rs-finding-open")).toBeVisible()
    await expect(page.locator(".rs-finding__open-row")).toHaveCount(draft.openTensions.length)
    // 没有处置入口——这里是交付物，不是工作区。
    expect(await page.locator("main button.rs-rail__dispose").count()).toBe(0)
  })

  test("样式真的加载了：这一页不是一份没写 CSS 的 HTML", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoFinding(page)

    /**
     * ⚠ 这条断言守的是一个**静默到几乎不可能被发现**的失败模式。
     *
     * `research-shell.css` 由 `research-workspace.tsx` import，而 App Router
     * 按**模块图**打包 CSS —— 于是它只跟着工作区那条路由走。Finding 是
     * 另一条路由、另一个入口组件，最初它**没有** import 那两份样式，
     * 结果整页退回浏览器默认样式。
     *
     * 那个状态下：不报错、不警告、所有元素都在、所有按 testid 的断言
     * 全都通过。只有**计算样式**能看出问题。所以这里刻意断言几条
     * 只能由 `.rs-*` 规则产生的计算值。
     */
    const sampled = await page.evaluate(() => {
      const section = document.querySelector(".rs-finding__section")!
      const body = document.querySelector(".rs-finding__body")!
      const shell = document.querySelector(".rs-shell")!
      return {
        // 分节的下边框来自 §7f —— 浏览器默认样式下是 0。
        sectionBorder: parseFloat(getComputedStyle(section).borderBottomWidth),
        // 交付物正文的字体栈来自 §7f 引用的 pack token。
        bodyFont: getComputedStyle(body).fontFamily,
        // pack 的 canvas 底色来自 §2a/§2e 的桥接。
        shellBg: getComputedStyle(shell).backgroundColor,
      }
    })
    expect(sampled.sectionBorder, "分节的 hairline 没有出现——样式没加载").toBeGreaterThan(0)
    expect(sampled.bodyFont, "正文没有拿到 pack 的字体栈").not.toBe("")
    expect(sampled.shellBg, "pack 的底色没有生效").not.toBe("rgba(0, 0, 0, 0)")
  })

  test("研究范围含「明确排除」的部分，且它与范围内的呈现不同", async ({ page }) => {
    await gotoFinding(page)
    const excluded = page.locator('.rs-finding__scope-row[data-excluded="true"]')
    await expect(excluded).toHaveCount(1)
    await expect(excluded).toContainText(loadBearingResearch.research.scope.out[0]!)
  })
})
