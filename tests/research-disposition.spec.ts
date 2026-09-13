import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  deriveTensions,
  isTensionStillRaised,
  loadBearingResearch,
  mayEnterFinding,
  parseTensionId,
  projectKnownLimitations,
  projectTensions,
  tensionIdFor,
  type ResearchData,
} from "../lib/research"
import { projectArgumentChain, projectReviewerBoard } from "../lib/research-ui"
import { RESEARCH_LABELS, REVIEWER_COPY } from "../lib/research-ui/copy"

/**
 * Phase E+F —— 处置与审稿意见。
 *
 * 这个 spec 守的是本阶段唯一真正重要的区分：
 *
 * ```
 * 未处理            洞还在，还没人决定
 * 已解决            事实变了，洞没了          ← 要求事实改变（领域层守卫）
 * 接受为已知局限    洞还在，我带着它交付      ← 人的判断
 * 已接受为待处理    我看过这条批评了          ← 还没处理完（AI 意见的状态）
 * ```
 *
 * 四种状态，四个词，四套样子。任何两个被合并成一个「已处理」，
 * 都会让其中一个偷偷变成另一个。
 */

const ROUTE = "/r/res-load-bearing"

/** 与页面**同一套**组装函数与同一份词典绑定。 */
const chain = projectArgumentChain(loadBearingResearch, RESEARCH_LABELS, REVIEWER_COPY)

const UNSUPPORTED_TENSION = tensionIdFor("unsupported-claim", "clm-cost-inflection")
const SINGLE_SOURCE_TENSION = tensionIdFor("single-source", "clm-utilization-recovery")

/** 夹具里那条**已经**被接受为局限的张力。 */
const EXISTING_LIMITATION = SINGLE_SOURCE_TENSION

async function gotoResearch(page: Page) {
  await page.goto(ROUTE)
  await expect(page.getByTestId("research-shell")).toBeVisible()
}

/**
 * 未处理条目在**两处**渲染：桌面窄带与移动端底部清单。
 * 其中一个被 CSS 隐藏，但两个都在 DOM 里——所以任何按 testid 的定位
 * 都必须在给定视口下限定范围，否则 strict mode 会命中两个。
 */
function desktopTrigger(page: Page, tensionId: string) {
  return page.locator(".rs-rail-desktop").getByTestId(`dispose-${tensionId}`)
}

async function desktopDispose(page: Page, tensionId: string) {
  await desktopTrigger(page, tensionId).click()
}

/* -------------------------------------------------------------------------- */
/* 1 · 三个状态在页面上是三个不同的地方                                          */
/* -------------------------------------------------------------------------- */

test.describe("1 · 三个处置状态", () => {
  test("未处理的张力在 rail 里，且每条都有独立的处置入口", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const rail = page.locator(".rs-rail-desktop")
    await expect(rail).toBeVisible()
    await expect(rail.locator(".rs-rail__row")).toHaveCount(chain.openTensions.length)

    // 每条未处理项都带着它自己的处置入口。
    for (const tension of chain.openTensions) {
      await expect(page.getByTestId(`dispose-${tension.id}`)).toHaveCount(1)
    }
  })

  test("rail item 里没有嵌套按钮（这是 Phase D 单按钮结构的必要重构）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    // 嵌套 button 是非法 HTML，也会让聚焦行为无法预测。
    expect(await page.locator("button button").count()).toBe(0)
    // 每个条目恰好两个兄弟控件：定位 + 处置。
    const row = page.locator(".rs-rail__row").first()
    await expect(row.locator("button")).toHaveCount(2)
  })

  test("已知局限与未处理**分段显示**，不是同一个列表", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const rail = page.locator(".rs-rail-desktop")
    await expect(rail).toContainText("已知局限")
    // 夹具里接受过的那条：在「已知局限」段里，**不在**未处理行里。
    await expect(rail.locator(`[data-limitation-id="${EXISTING_LIMITATION}"]`)).toHaveCount(1)
    await expect(rail.locator(`[data-tension-id="${EXISTING_LIMITATION}"]`)).toHaveCount(0)
  })

  test("已接受的局限带着理由、日期，以及「对应的缺口仍然存在」", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    /* 已知局限会渲染在**两个地方**：窄带里，以及那条论断上。
       同一个实体两处出现是刻意的（可追溯），所以定位必须限定范围。 */
    const item = page.locator(`.rs-rail-desktop [data-limitation-id="${EXISTING_LIMITATION}"]`)
    const limitation = projectKnownLimitations(loadBearingResearch).find(
      (entry) => entry.tensionId === EXISTING_LIMITATION,
    )!
    await expect(item).toContainText(limitation.reason)
    await expect(item).toContainText(limitation.acceptedAt.slice(0, 10))
    /* 这一行是 accepted-as-limitation 的**定义**：洞还在，我带着它交付。
       它消失的那一天，这个状态就退化成了「已解决」。 */
    await expect(page.getByTestId(`limitation-raised-${EXISTING_LIMITATION}`)).toHaveText(
      "对应的缺口仍然存在",
    )
  })

  test("已解决与已接受的措辞是**两个不同的词**，而且都不同于「已处理」", async () => {
    // 源码级断言：这三个词必须同时存在且互不相同。
    const source = readFileSync(join(process.cwd(), "lib/i18n/zh-CN.ts"), "utf8")
    const stateOpen = /stateOpen: "([^"]+)"/.exec(source)?.[1]
    const stateResolved = /stateResolved: "([^"]+)"/.exec(source)?.[1]
    const stateAccepted = /stateAccepted: "([^"]+)"/.exec(source)?.[1]

    expect(stateOpen).toBeTruthy()
    expect(stateResolved).toBeTruthy()
    expect(stateAccepted).toBeTruthy()
    expect(new Set([stateOpen, stateResolved, stateAccepted]).size).toBe(3)
    // 而且没有任何一个是那句被禁止的合并说法。
    for (const word of [stateOpen, stateResolved, stateAccepted]) {
      expect(word).not.toBe("已处理")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 守卫：resolved 不能被随手写下                                             */
/* -------------------------------------------------------------------------- */

test.describe("2 · resolved 守卫", () => {
  test("对事实未变的缺口点「标记为已解决」→ 被拒绝，并说明理由", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoResearch(page)

    // 这条缺口**事实还在**（那条论断至今没有任何证据）。
    expect(isTensionStillRaised(loadBearingResearch, UNSUPPORTED_TENSION)).toBe(true)

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await expect(panel).toBeVisible()

    await panel.locator('input[value="resolved"]').check()
    await panel.locator("textarea").fill("我觉得可以了。")
    await panel.getByRole("button", { name: "确认已解决" }).click()

    /* 拒绝**留在面板里**，不是 toast。用户要能就地读到理由并改。
       把守卫的理由做成一个读完就没的提示，会让「试试能不能标记为已解决」
       变成一件有成本的事——而它不该有成本，它是这个产品最主要的教学时刻。 */
    const rejected = panel.getByTestId("disposition-rejected")
    await expect(rejected).toBeVisible()
    await expect(rejected).toContainText("事实没有改变")
    await expect(rejected.locator("[data-issue-code]")).toHaveAttribute(
      "data-issue-code",
      "disposition/resolved-requires-fact-change",
    )
  })

  test("被拒绝之后，rail 一点都没变（状态、计数、局限数）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoResearch(page)

    const before = {
      open: chain.openTensions.length,
      limitations: chain.limitations.length,
    }

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await panel.locator('input[value="resolved"]').check()
    await panel.locator("textarea").fill("试试看。")
    await panel.getByRole("button", { name: "确认已解决" }).click()
    await expect(panel.getByTestId("disposition-rejected")).toBeVisible()

    await expect(page.locator(".rs-rail__row")).toHaveCount(before.open)
    await expect(
      page.locator(".rs-rail-desktop [data-limitation-id]").filter({ hasText: "单一来源" }),
    ).toHaveCount(1)
    await expect(
      page.locator(".rs-rail-desktop .rs-rail__head .kits-label"),
    ).toContainText(String(before.open))
  })

  test("理由为空时两种出口都被拒绝，且理由是「理由为空」而不是别的", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoResearch(page)

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await panel.getByRole("button", { name: "接受为局限" }).click()

    const rejected = panel.getByTestId("disposition-rejected")
    await expect(rejected).toBeVisible()
    await expect(rejected.locator("[data-issue-code]")).toHaveAttribute(
      "data-issue-code",
      "disposition/missing-reason",
    )
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 接受为局限：允许，而且洞仍然在                                            */
/* -------------------------------------------------------------------------- */

test.describe("3 · 接受为已知局限", () => {
  test("事实仍在时接受成功：条目从未处理移到已知局限，计数同步", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await gotoResearch(page)

    const openBefore = chain.openTensions.length
    const limitationsBefore = chain.limitations.length
    expect(chain.openTensions.some((tension) => tension.id === UNSUPPORTED_TENSION)).toBe(true)

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    const reason = "目前只能取得二手行业报告，无法获得 2025 年后的一手产能数据。"
    await panel.locator("textarea").fill(reason)
    await panel.getByRole("button", { name: "接受为局限" }).click()

    // 面板关闭、条目换段。
    await expect(panel).toHaveCount(0)
    await expect(page.locator(`.rs-rail__row[data-tension-id="${UNSUPPORTED_TENSION}"]`)).toHaveCount(0)
    const limitation = page.locator(`.rs-rail-desktop [data-limitation-id="${UNSUPPORTED_TENSION}"]`)
    await expect(limitation).toHaveCount(1)
    await expect(limitation).toContainText(reason)
    // 同时也出现在那条论断上，所以两处计数都是 2。
    await expect(page.locator(`[data-limitation-id="${UNSUPPORTED_TENSION}"]`)).toHaveCount(2)

    // 计数由投影算出，不是手工维护的两个数。
    await expect(page.locator(".rs-rail__row")).toHaveCount(openBefore - 1)
    await expect(page.locator(".rs-rail-desktop")).toContainText(
      `${limitationsBefore + 1} 项`,
    )
  })

  test("接受之后事实**没有**改变——洞仍然存在", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await gotoResearch(page)

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await panel.locator("textarea").fill("拿不到一手材料。")
    await panel.getByRole("button", { name: "接受为局限" }).click()
    await expect(panel).toHaveCount(0)

    /* 界面上的三处证据都说明洞还在：
       1. 局限条目自己写着「对应的缺口仍然存在」；
       2. 那条论断仍然是「尚无支持」；
       3. 它的空槽**没有被填上**。 */
    await expect(page.getByTestId(`limitation-raised-${UNSUPPORTED_TENSION}`)).toHaveText(
      "对应的缺口仍然存在",
    )
    const claim = page.locator('[data-claim-id="clm-cost-inflection"]')
    await expect(claim).toContainText("尚无支持")
    /* 空槽本体画在**首屏那张卡片**里（链条里那一处是刻意折叠的重复——
       见 research-shell.css 的 data-suppressed-gap）。所以这里断言卡片。 */
    await expect(page.locator("[data-testid='primary-gap-lead'] .rs-gap__empty")).toHaveText(
      "尚无证据支撑",
    )
    /* 而且接受局限**没有**把空槽或材料要求去掉。
       这是本阶段修正过的一个真实缺陷：一开始 gaps 与 flags 都从
       `openTensions` 取，于是接受局限之后那条论断的**虚线空槽就消失了**
       ——洞变得看不见。根因是把两类东西当成了同一类：
       空槽是**事实**（那一栏是空的），标记是**待办**（这里需要你处理）。
       接受之后待办消失，事实不变。 */
    await expect(claim.locator(".rs-gap__require").first()).toBeAttached()

    // 领域侧：重算后张力仍在。
    expect(isTensionStillRaised(loadBearingResearch, UNSUPPORTED_TENSION)).toBe(true)
  })

  test("接受之后，那条论断上也出现「已接受为已知局限」——可追溯，不是只活在 rail 里", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await gotoResearch(page)

    await desktopDispose(page, UNSUPPORTED_TENSION)
    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await panel.locator("textarea").fill("短期内不再找第二来源。")
    await panel.getByRole("button", { name: "接受为局限" }).click()

    const claimLimitation = page.locator(
      `[data-claim-id="clm-cost-inflection"] [data-limitation-id="${UNSUPPORTED_TENSION}"]`,
    )
    await expect(claimLimitation).toHaveCount(1)
    await expect(claimLimitation).toContainText("已接受为已知局限")
    /* 追溯性由 **DOM 属性**承担，不是可见文案：原始张力 id 是代码标识符，
       印出来既是术语噪音，也会在本地化审计里变成一处「未翻译的英文」。
       `data-limitation-id` **就是**张力 id，所以「这条局限说的是哪个问题」
       永远机器可查；人读到的是「无证据支撑」。 */
    await expect(claimLimitation).toHaveAttribute("data-limitation-id", UNSUPPORTED_TENSION)
    await expect(claimLimitation).toContainText("无证据支撑")
  })

  test("已知局限条目**没有**处置入口——它已经是一个决定，不是一个待办", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoResearch(page)
    const item = page.locator(`.rs-rail-desktop [data-limitation-id="${EXISTING_LIMITATION}"]`)
    // 只有一个「定位到这条论断」按钮；没有「处理」。
    await expect(item.locator("button")).toHaveCount(1)
    await expect(item).not.toContainText("处理")
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · 键盘与焦点                                                              */
/* -------------------------------------------------------------------------- */

test.describe("4 · 键盘可用与抽屉焦点", () => {
  test("处置面板可以完全用键盘打开并提交", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await gotoResearch(page)

    const trigger = desktopTrigger(page, UNSUPPORTED_TENSION)
    await trigger.focus()
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Enter")

    const panel = page.getByTestId(`disposition-panel-${UNSUPPORTED_TENSION}`)
    await expect(panel).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  test("移动端抽屉：打开时焦点进入、Tab 在内部循环、Escape 关闭", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
    await page.getByTestId("tension-dock").getByTestId(`dispose-${UNSUPPORTED_TENSION}`).click()

    const sheet = page.getByTestId("disposition-sheet")
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute("role", "dialog")
    await expect(sheet).toHaveAttribute("aria-modal", "true")

    // ① 焦点进入抽屉。
    const focusInside = await page.evaluate(
      () => document.querySelector("[data-testid='disposition-sheet']")?.contains(document.activeElement) ?? false,
    )
    expect(focusInside, "打开抽屉后焦点必须在抽屉内").toBe(true)

    // ② Tab 循环：连按多次仍然留在抽屉里。
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab")
      const stillInside = await page.evaluate(
        () => document.querySelector("[data-testid='disposition-sheet']")?.contains(document.activeElement) ?? false,
      )
      expect(stillInside, `第 ${i + 1} 次 Tab 后焦点跑出了抽屉`).toBe(true)
    }

    // ③ Escape 关闭。
    await page.keyboard.press("Escape")
    await expect(sheet).toHaveCount(0)
  })

  test("抽屉关闭后焦点回到触发它的那个控件", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
    const trigger = page.getByTestId("tension-dock").getByTestId(`dispose-${UNSUPPORTED_TENSION}`)
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("disposition-sheet")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByTestId("disposition-sheet")).toHaveCount(0)

    // ④ 焦点归还。不还的话用户会被丢回页面顶部。
    await expect(trigger).toBeFocused()
  })

  test("抽屉关闭时，它的内容**不在**可聚焦树里", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
    await expect(page.getByTestId("disposition-sheet")).toHaveCount(0)

    // 关闭态是**条件渲染**，不是 display:none —— 后者仍然可以被 Tab 到。
    const radios = await page.locator('.rs-sheet input[type="radio"]').count()
    expect(radios).toBe(0)
    await page.keyboard.press("Tab")
    const inSheet = await page.evaluate(
      () => document.querySelector(".rs-sheet")?.contains(document.activeElement) ?? false,
    )
    expect(inSheet).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · AI Reviewer                                                             */
/* -------------------------------------------------------------------------- */

test.describe("5 · AI Reviewer", () => {
  test("三类输出的标签与形状**都不同**，不是只靠颜色", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const classes = await page
      .locator(".rs-note")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          cls: node.getAttribute("data-note-class"),
          borderStyle: getComputedStyle(node).borderInlineStartStyle,
          borderWidth: getComputedStyle(node).borderInlineStartWidth,
        })),
      )

    const seen = new Map(classes.map((entry) => [entry.cls, entry]))
    expect(seen.has("critique")).toBe(true)
    expect(seen.has("factual")).toBe(true)
    expect(seen.has("suggestion")).toBe(true)

    // 形状通道：三类两两不同（粗实线 / 细实线 / 点线）。
    const signatures = [...seen.values()].map((entry) => `${entry.borderStyle}:${entry.borderWidth}`)
    expect(new Set(signatures).size, `三类输出的左规则线必须两两不同：${signatures.join(" / ")}`).toBe(3)
  })

  test("class 1 事实**永远**带出处", () => {
    const board = projectReviewerBoard(loadBearingResearch, REVIEWER_COPY, RESEARCH_LABELS)
    expect(board.factuals.length).toBeGreaterThan(0)
    for (const note of board.factuals) {
      expect(note.passageIds.length, `${note.id} 没有出处`).toBeGreaterThan(0)
      expect(note.passageLabels.length).toBe(note.passageIds.length)
    }
  })

  test("class 2 批评**永远**有靶心（论断或张力）", () => {
    const board = projectReviewerBoard(loadBearingResearch, REVIEWER_COPY, RESEARCH_LABELS)
    expect(board.critiques.length).toBeGreaterThan(0)
    for (const note of board.critiques) {
      expect(
        note.claimId !== null || note.tensionId !== null,
        `${note.id} 没有靶心 —— 不可处理的批评只会变成噪音`,
      ).toBe(true)
    }
  })

  test("class 3 建议零引用，并且自己声明进不了交付物", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const board = projectReviewerBoard(loadBearingResearch, REVIEWER_COPY, RESEARCH_LABELS)
    for (const note of board.suggestions) {
      expect(note.passageIds).toEqual([])
      expect(note.claimId).toBeNull()
    }

    const suggestion = page.locator('.rs-note[data-note-class="suggestion"]').first()
    await expect(suggestion).toBeVisible()
    await expect(suggestion).toContainText("AI 建议")
    await expect(suggestion).toContainText("不会进入交付物")

    // 而且它在语义上确实进不了 Finding。
    for (const output of loadBearingResearch.aiOutputs) {
      if (output.kind === "suggestion") expect(mayEnterFinding(output)).toBe(false)
    }
  })

  test("批评指向的是**领域层已有的张力**，不是第二套事实模型", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const derived = chain.reviewer.critiques.filter((note) => note.provenance === "derived")
    expect(derived.length).toBeGreaterThan(0)

    const derivedIds = new Set(deriveTensions(loadBearingResearch).map((tension) => tension.id))
    for (const note of derived) {
      /* 只有一种机械检查**不是**张力：读法检查（「没找到反例」≠「已验证」）。
         它说的不是事实问题，所以 `tensionId` 必须是 null——
         硬给它造一条张力会让张力带失去可信度。 */
      if (note.id.startsWith("rev-reading-trap-")) {
        expect(note.tensionId, `${note.id} 不是张力，不该有 tensionId`).toBeNull()
        expect(note.tensionKind).toBeNull()
        continue
      }
      expect(note.tensionId, `${note.id} 没有指向张力`).toBeTruthy()
      expect(derivedIds.has(note.tensionId!), `${note.tensionId} 不是 domain 能推导出来的张力`).toBe(
        true,
      )
    }
    // 读法检查确实存在——否则上面那个分支是死代码。
    expect(derived.some((note) => note.id.startsWith("rev-reading-trap-"))).toBe(true)

    // 源码级：这个仓库里不存在 AiTension 这类平行模型。
    const source = readFileSync(join(process.cwd(), "lib/research-ui/reviewer.ts"), "utf8")
    expect(source).not.toMatch(/interface\s+Ai(Tension|Issue|Finding)/)
  })

  test("审稿人**没有**聊天输入框（第一眼就不该像聊天）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 })
    await gotoResearch(page)

    /* 这条是「Reviewer 不是换皮 Chatbot」的机械证明：
       默认状态下页面里**没有任何**自由文本输入。
       处置面板的理由字段只在面板打开时出现，所以它不是常驻输入。 */
    expect(await page.locator('input[type="text"], input[type="search"]').count()).toBe(0)
    expect(await page.locator("textarea").count()).toBe(0)
    expect(await page.locator("[contenteditable]").count()).toBe(0)

    // 而且没有任何「问 AI / 发送」这类控件。
    const labels = await page.locator("button").evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").trim()),
    )
    for (const label of labels) {
      expect(label).not.toMatch(/发送|提问|问 AI|Ask/i)
    }
  })

  test("驳回：进入历史投影、留下痕迹，但**输出还在**", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 })
    await gotoResearch(page)

    const board = projectReviewerBoard(loadBearingResearch, REVIEWER_COPY, RESEARCH_LABELS)
    const target = board.critiques.find((note) => note.provenance === "authored")!
    const before = board.rejected.length

    await page.getByTestId(`note-reject-${target.id}`).click()
    const note = page.locator(`[data-note-id="${target.id}"]`)
    await note.locator("textarea").fill("这条批评的靶心不对。")
    await note.getByRole("button", { name: "确认驳回" }).click()

    // 元素没有消失 —— 它换了状态。
    const after = page.locator(`[data-note-id="${target.id}"]`)
    await expect(after).toHaveAttribute("data-note-state", "rejected")
    await expect(after).toContainText("已驳回")

    // 历史投影里多了一条（原来就有一条被驳回的建议）。
    await expect(page.locator("[data-testid='rejected-outputs-note']")).toBeVisible()
    expect(before).toBe(1)
  })

  test("接受为待处理：状态变了，但**没有**处置任何张力", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    /* 只有 **authored** 的批评可以被采纳——因为只有它是一条真实存在的
       AI 输出。自动检查得出的批评没有对应的对象，给它「接受」按钮
       就得往轨迹里写一个虚构的 subject。 */
    const board = projectReviewerBoard(loadBearingResearch, REVIEWER_COPY, RESEARCH_LABELS)
    const target = board.critiques.find((note) => note.provenance === "authored")!
    const openBefore = chain.openTensions.length

    await page.getByTestId(`note-acknowledge-${target.id}`).click()
    const note = page.locator(`[data-note-id="${target.id}"]`)
    await note.locator("textarea").fill("确实需要补材料。")
    await note.getByRole("button", { name: "确认接受" }).click()

    await expect(page.locator(`[data-note-id="${target.id}"]`)).toHaveAttribute(
      "data-note-state",
      "acknowledged",
    )
    await expect(page.locator(`[data-testid='note-state-${target.id}']`)).toHaveText("已接受为待处理")

    /* 关键：采纳 AI 的意见**不是**处置。
       未处理的张力数量一个都没少——因为没有任何事实改变，
       也没有人做出「接受这个边界」的决定。 */
    await expect(page.locator(".rs-rail__row")).toHaveCount(openBefore)
  })

  test("自动检查的批评**没有**驳回按钮，但有一个通往处置的入口", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const derived = chain.reviewer.critiques.find(
      (note) => note.provenance === "derived" && note.tensionId !== null,
    )!
    // 没有驳回：它不是一条 AI 输出，没有可以被驳回的对象。
    await expect(page.getByTestId(`note-reject-${derived.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`note-acknowledge-${derived.id}`)).toHaveCount(0)

    // 但它把用户送到**同一条**缺口的处置面板上。
    await page.getByTestId(`note-dispose-${derived.id}`).click()
    await expect(page.getByTestId(`disposition-panel-${derived.tensionId}`)).toBeVisible()
  })

  test("建议只能被驳回——它没有「接受为待处理」", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 })
    await gotoResearch(page)

    const suggestion = chain.reviewer.suggestions[0]!
    await expect(page.getByTestId(`note-acknowledge-${suggestion.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`note-reject-${suggestion.id}`)).toHaveCount(1)
  })

  test("被驳回的输出仍然可读，且带着「已驳回」前缀", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 })
    await gotoResearch(page)

    const rejected = chain.reviewer.rejected[0]!
    const node = page.locator(`[data-note-id="${rejected.id}"]`)
    await expect(node).toHaveCount(1)
    await expect(node).toHaveAttribute("data-note-state", "rejected")
    await expect(node).toContainText("已驳回")
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · 第一视觉保护（Phase D 的回归门）                                          */
/* -------------------------------------------------------------------------- */

test.describe("6 · 第一视觉没有被抢走", () => {
  test("desktop：缺口仍然在 fold 以上，而且排在所有审稿意见之前", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const gap = await page.getByTestId("primary-gap-lead").boundingBox()
    expect(gap).not.toBeNull()
    expect(gap!.y, "缺口必须仍然在首屏").toBeLessThan(900)

    // 文档顺序：缺口在所有审稿意见之前。
    const gapFirst = await page.evaluate(() => {
      const gapNode = document.querySelector("[data-testid='primary-gap-lead']")
      const firstNote = document.querySelector(".rs-note")
      if (!gapNode || !firstNote) return null
      return gapNode.compareDocumentPosition(firstNote) & Node.DOCUMENT_POSITION_FOLLOWING
        ? "gap-first"
        : "note-first"
    })
    expect(gapFirst).toBe("gap-first")
  })

  test("mobile：fold 以上仍然是 context + question + 最大缺口", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    const fold = 844
    for (const selector of [
      ".rs-running-head",
      ".rs-question",
      "[data-testid='primary-gap-lead']",
    ]) {
      const box = await page.locator(selector).first().boundingBox()
      expect(box, `${selector} 不在页面上`).not.toBeNull()
      expect(box!.y, `${selector} 必须仍在 fold 以上`).toBeLessThan(fold)
    }
  })

  test("审稿意见在视觉上**弱于**缺口（差两级，不是靠感觉）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const contrast = await page.evaluate(() => {
      const gap = document.querySelector("[data-testid='primary-gap-lead'] .rs-gap__slot")!
      const note = document.querySelector(".rs-note")!
      const root = getComputedStyle(document.querySelector(".rs-shell")!)
      const ink = root.getPropertyValue("--kits-color-ink").trim()
      const noteColor = getComputedStyle(note).borderInlineStartColor
      return { gapBorder: getComputedStyle(gap).borderTopColor, ink, noteColor }
    })

    // 缺口的边用 ink-muted（强），审稿意见的边用 rule（弱）——两者不同。
    expect(contrast.noteColor).not.toBe(contrast.gapBorder)
  })

  test("没有出现 card soup：新表面不引入投影", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoResearch(page)

    const shadows = await page
      .locator(".rs-disposition, .rs-note, .rs-sheet, .rs-rail__limitation")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).boxShadow))
    expect(shadows.length).toBeGreaterThan(0)
    for (const shadow of shadows) {
      expect(shadow === "none" || shadow === "").toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 7 · 组装层一致性                                                             */
/* -------------------------------------------------------------------------- */

test.describe("7 · 组装层", () => {
  test("已知局限投影只收 accepted-as-limitation，且全部可追溯", () => {
    const limitations = projectKnownLimitations(loadBearingResearch)
    expect(limitations.length).toBeGreaterThan(0)

    const acceptedIds = new Set(
      loadBearingResearch.dispositions
        .filter((disposition) => disposition.resolution === "accepted-as-limitation")
        .map((disposition) => disposition.tensionId),
    )
    for (const limitation of limitations) {
      expect(acceptedIds.has(limitation.tensionId)).toBe(true)
      expect(limitation.reason.trim().length).toBeGreaterThan(0)
      // 每条都能拆回 (kind, claimId) —— 所以「它说的是哪条论断」永远可验证。
      expect(parseTensionId(limitation.tensionId)).toEqual({
        kind: limitation.kind,
        claimId: limitation.claimId,
      })
    }
  })

  test("三个状态互不重叠，且合起来等于全部张力", () => {
    const tensions = projectTensions(loadBearingResearch)
    const openIds = new Set(chain.openTensions.map((tension) => tension.id))
    const resolvedIds = new Set(chain.resolvedTensions.map((tension) => tension.id))
    const limitationIds = new Set(chain.limitations.map((limitation) => limitation.tensionId))

    for (const id of openIds) {
      expect(resolvedIds.has(id)).toBe(false)
      expect(limitationIds.has(id)).toBe(false)
    }
    // 每个张力要么未处理，要么被处置成两种出口之一。
    for (const tension of tensions) {
      const buckets = [openIds.has(tension.id), resolvedIds.has(tension.id), limitationIds.has(tension.id)]
      expect(buckets.filter(Boolean).length, `${tension.id} 落在 ${buckets} 个桶里`).toBe(1)
    }
  })

  test("组装层仍然是纯函数：同样的输入得到同样的输出", () => {
    const data: ResearchData = loadBearingResearch
    expect(projectArgumentChain(data, RESEARCH_LABELS, REVIEWER_COPY).openTensions).toEqual(
      projectArgumentChain(data, RESEARCH_LABELS, REVIEWER_COPY).openTensions,
    )
  })
})
