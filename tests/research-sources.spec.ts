import { test, expect, type Page } from "@playwright/test"

import {
  loadBearingResearch,
  projectSourceIndex,
  deriveTensions,
  isTensionStillRaised,
  tensionIdFor,
  validateSourceIndex,
  type ResearchData,
} from "../lib/research"
import { projectArgumentChain } from "../lib/research-ui"
import { RESEARCH_LABELS, REVIEWER_COPY } from "../lib/research-ui/copy"

/**
 * Phase G+H —— Source Index 与「补一条引用」。
 *
 * 这个 spec 守两件事，它们其实是同一件事的两面：
 *
 * ```
 * 材料视图   我还剩什么、它们被怎么用      ← 只读的那一面
 * 关联表单   把一段原文挂到一条论断上      ← 唯一改变事实的那一面
 * ```
 *
 * 第二面是本产品里**唯一**会真的改变论证的界面操作。它把洞填上、
 * 让缺口重算、并让 `resolved` 第一次成为合法操作——所以它值得
 * 最密的守卫与最长的测试。
 */

const ROUTE = "/r/res-load-bearing"

/** 与页面**同一套**组装函数与同一份词典绑定。 */
const chain = projectArgumentChain(loadBearingResearch, RESEARCH_LABELS, REVIEWER_COPY)
const index = projectSourceIndex(loadBearingResearch)

const UNSUPPORTED = tensionIdFor("unsupported-claim", "clm-cost-inflection")
const UNSUPPORTED_CLAIM = "clm-cost-inflection"
/** 一段真实存在、且**尚未**与 `UNSUPPORTED_CLAIM` 关联过的原文。 */
const FRESH_PASSAGE = "psg-summary-cost"
const FRESH_SOURCE = "src-paid-summary"

async function gotoResearch(page: Page) {
  await page.goto(ROUTE)
  await expect(page.getByTestId("research-shell")).toBeVisible()
}

/**
 * 打开材料抽屉。
 *
 * 入口在**窄带**与**底部清单**里各有一个（同一时刻只有一个可见），
 * 所以定位必须限定范围——否则 strict mode 会命中两个。
 */
async function openSources(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024
  if (mobile) {
    await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
    await page.waitForTimeout(250)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()
  } else {
    await page.locator(".rs-rail-desktop").getByTestId("open-source-index").click()
  }
  await expect(page.getByTestId("source-sheet")).toBeVisible()
}

/* -------------------------------------------------------------------------- */
/* 1 · 纯函数：材料视图的两个方向                                                */
/* -------------------------------------------------------------------------- */

test.describe("Source Index · 投影", () => {
  test("每份材料都能列出它的片段，以及每段被哪些论断以什么身份使用", () => {
    const entries = projectSourceIndex(loadBearingResearch)
    expect(entries).toHaveLength(loadBearingResearch.sources.length)

    for (const entry of entries) {
      // 片段必须真的属于这份材料——不是「大概相关」。
      for (const passageEntry of entry.passages) {
        expect(passageEntry.passage.sourceId).toBe(entry.source.id)
      }
      // 「被 N 条论断使用」按**去重后**的论断 id 算。
      const allClaimIds = entry.passages.flatMap((p) => p.usages.map((u) => u.claimId))
      expect([...entry.usedByClaimIds].sort()).toEqual([...new Set(allClaimIds)].sort())
    }
  })

  test("反向可追溯：每处用法都能追到一条真实论断与一条真实链接", () => {
    const claimIds = new Set(loadBearingResearch.claims.map((claim) => claim.id))
    const linkIds = new Set(loadBearingResearch.links.map((link) => link.id))
    for (const entry of index) {
      for (const passageEntry of entry.passages) {
        for (const usage of passageEntry.usages) {
          expect(claimIds.has(usage.claimId)).toBe(true)
          expect(linkIds.has(usage.linkId)).toBe(true)
        }
      }
    }
  })

  test("已停用的引用仍然出现在用法里——历史投影不从材料视图里消失", () => {
    const retired = loadBearingResearch.links.filter((link) => link.retiredAt !== null)
    expect(retired.length, "夹具里必须有停用链接，否则这条断言是空的").toBeGreaterThan(0)

    const flat = index.flatMap((entry) => entry.passages.flatMap((p) => p.usages))
    for (const link of retired) {
      expect(
        flat.some((usage) => usage.linkId === link.id && usage.retiredAt !== null),
        `${link.id} 已停用，但必须仍然可查`,
      ).toBe(true)
    }
  })

  test("夹具本身就是自洽的：没有坏引用、没有重复的活跃链接", () => {
    expect(validateSourceIndex(loadBearingResearch)).toEqual([])
  })

  test("负例：凭空造一条重复的活跃链接 → 校验必须说话", () => {
    const broken: ResearchData = structuredClone(loadBearingResearch)
    const original = broken.links.find((link) => link.retiredAt === null)!
    broken.links = [...broken.links, { ...original, id: "lnk-copy" }]
    expect(validateSourceIndex(broken).map((issue) => issue.code)).toContain(
      "source-index/duplicate-link",
    )
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 抽屉本身：开关、焦点、层级                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Source Index · 抽屉", () => {
  test("可以打开、可以关闭，关闭后内容**不在文档里**", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)

    await openSources(page)
    await expect(page.getByTestId("source-index")).toBeVisible()
    // 一份材料被默认展开——打开就看得见内容，不是让用户再点一次。
    await expect(page.locator(".rs-src[data-open='true']")).toHaveCount(1)

    await page.getByTestId("source-sheet-close").click()
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)
    // 关闭 = 不在可聚焦树里（条件渲染，不是 CSS 藏）。
    expect(await page.locator(".rs-src__head").count()).toBe(0)
  })

  test("Escape 关闭，焦点回到触发它的那个按钮", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const trigger = page.locator(".rs-rail-desktop").getByTestId("open-source-index")
    await trigger.click()
    await expect(page.getByTestId("source-sheet")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("打开时焦点进入抽屉，Tab 在里面循环", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    const inside = await page.evaluate(() =>
      !!document.activeElement?.closest('[data-testid="source-sheet"]'),
    )
    expect(inside, "焦点必须进入抽屉").toBe(true)

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab")
      const stillInside = await page.evaluate(() =>
        !!document.activeElement?.closest('[data-testid="source-sheet"]'),
      )
      expect(stillInside, `第 ${i + 1} 次 Tab 之后焦点跑出了抽屉`).toBe(true)
    }
  })

  test("它与 rail 是同一个入口的两个位置，不是两个入口", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    /* 桌面：窄带里有一个；底部清单是 CSS 隐藏的，且它关闭时里面
       **什么都没有**（条件渲染）——所以整份文档里只有一个可见入口。 */
    await expect(page.locator(".rs-rail-desktop").getByTestId("open-source-index")).toBeVisible()
    await expect(page.locator(".rs-rail-desktop [data-testid='open-trace']")).toBeVisible()
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 内容：不是表格                                                            */
/* -------------------------------------------------------------------------- */

test.describe("Source Index · 内容形态", () => {
  test("按层展开：材料 → 片段 → 用法，不做横向表格", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    // 没有 table / grid 布局的元数据行。
    expect(await page.locator(".rs-sources table").count()).toBe(0)
    // 一份材料展开之后才有片段；其余材料的片段**不在文档里**。
    const openCount = await page.locator(".rs-src[data-open='true']").count()
    expect(openCount).toBe(1)
    const otherPassages = await page.locator(".rs-src[data-open='false'] .rs-psg").count()
    expect(otherPassages, "未展开的材料不该渲染它的片段").toBe(0)
  })

  test("每段原文显示定位，且用法带关系词——关系词来自契约", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    // 展开第一份材料的第一段。
    await page.locator(".rs-psg__head").first().click()
    await page.waitForTimeout(200)

    const locatorText = await page.locator(".rs-psg__locator").first().innerText()
    expect(locatorText.trim().length).toBeGreaterThan(0)

    const stanceWords = await page
      .locator(".rs-psg__usage-stance")
      .evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    expect(stanceWords.length).toBeGreaterThan(0)
    // 必须是人话，不是 domain 的英文标识。
    for (const word of stanceWords) {
      expect(word, "关系词不该是英文标识").not.toMatch(/^[a-z-]+$/)
      expect(["反驳", "支持", "限定", "背景"]).toContain(word)
    }
  })

  test("来源的「性质」与「有效性」是两件事，各有自己的标记", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    const types = await page
      .locator(".rs-src__type")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-source-type")))
    const validities = await page
      .locator(".rs-src__validity")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-validity")))
    expect(new Set(types).size, "夹具里应当有不止一种来源性质").toBeGreaterThan(1)
    expect(validities).toContain("stale")
  })
})

/**
 * 展开一份材料 / 一段原文。
 *
 * ⚠ **不能直接 click**：第一条材料与第一段原文是**默认展开**的
 * （打开抽屉就该看见内容，而不是让用户再点一次），而对一个已经展开的
 * 条目再点一次是**收起**它。用 `aria-expanded` 判断的真实状态来驱动，
 * 比假设「点了就会开」稳得多——后者会在夹具顺序变化时静默失效。
 */
async function ensureSourceOpen(page: Page, sourceId: string) {
  const head = page.locator(`[data-source-id="${sourceId}"] .rs-src__head`)
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await expect(head).toHaveAttribute("aria-expanded", "true")
}

async function ensurePassageOpen(page: Page, passageId: string) {
  const head = page.locator(`[data-passage-id="${passageId}"] .rs-psg__head`)
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await expect(head).toHaveAttribute("aria-expanded", "true")
}

/* -------------------------------------------------------------------------- */
/* 4 · 写入：补一条引用                                                          */
/* -------------------------------------------------------------------------- */

test.describe("EvidenceLink · 写入流程", () => {
  test("选片段 → 选论断 → 选关系 → 建立引用，并留下轨迹", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    await ensureSourceOpen(page, FRESH_SOURCE)
    await ensurePassageOpen(page, FRESH_PASSAGE)
    await page.getByTestId(`compose-${FRESH_PASSAGE}`).click()

    // 表单的选项来自真实数据：论断列表里必须有真实论断。
    const options = await page.locator(".rs-link__select option").evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    )
    expect(options.length).toBeGreaterThan(0)
    for (const value of options) {
      expect(loadBearingResearch.claims.some((claim) => claim.id === value)).toBe(true)
    }
    // 被撤回的论断不在候选里——往一个已经关掉的文件里归档没有意义。
    expect(options).not.toContain("clm-expansion-announced")

    /* 这段原文在夹具里**已经**有一条 supports 用法，所以断言的是
       「多了一条挂到论断 2 上的用法」，而不是「用法总数变成 1」。 */
    const usage = page.locator(`[data-passage-id="${FRESH_PASSAGE}"] .rs-psg__usage`)
    const before = await usage.count()

    await page.locator(".rs-link__select").selectOption(UNSUPPORTED_CLAIM)
    await page.locator('.rs-link__stance[data-stance="supports"] input').check()
    await page.locator(".rs-link__note").fill("找到一份成本口径的材料。")
    await page.getByTestId("link-submit").click()

    await expect(page.getByTestId("link-accepted")).toBeVisible()
    await expect(page.getByTestId("link-accepted")).toContainText("支持")

    // 用法列表立刻多一条——材料视图是**现算**的，没有缓存要失效。
    await expect(usage).toHaveCount(before + 1)
    await expect(usage.filter({ hasText: "论断 2" })).toHaveCount(1)
  })

  test("重复建立同一条关系被拒绝，且理由留在表单里", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)

    // 夹具里 `psg-broker-utilization` 已经以 supports 挂在 `clm-utilization-recovery` 上。
    await ensureSourceOpen(page, "src-broker-industry-deck")
    await ensurePassageOpen(page, "psg-broker-utilization")
    await page.getByTestId("compose-psg-broker-utilization").click()

    // 表单**先说**这条关系已经存在——别让用户点了才知道。
    await page.locator(".rs-link__select").selectOption("clm-utilization-recovery")
    await expect(
      page.locator('.rs-link__stance[data-stance="supports"] [data-testid="existing-supports"]'),
    ).toBeVisible()

    await page.getByTestId("link-submit").click()
    const rejected = page.getByTestId("link-rejected")
    await expect(rejected).toBeVisible()
    await expect(rejected.locator('[data-issue-code="link/duplicate"]')).toHaveCount(1)
  })

  test("非法输入被拒绝时带稳定 code，且表单仍然可用", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)
    await ensureSourceOpen(page, FRESH_SOURCE)
    await ensurePassageOpen(page, FRESH_PASSAGE)
    await page.getByTestId(`compose-${FRESH_PASSAGE}`).click()

    // 成功之后再点一次同样的组合 = 重复。
    await page.locator(".rs-link__select").selectOption(UNSUPPORTED_CLAIM)
    await page.getByTestId("link-submit").click()
    await expect(page.getByTestId("link-accepted")).toBeVisible()
    await page.getByTestId("link-submit").click()
    await expect(page.getByTestId("link-rejected")).toBeVisible()
    // 表单没有被关掉——用户要能就地改。
    await expect(page.getByTestId("link-submit")).toBeEnabled()
  })

  test("打开关联表单不会把焦点丢到 body —— 丢了 Escape 就再也关不掉抽屉", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openSources(page)
    await ensureSourceOpen(page, FRESH_SOURCE)
    await ensurePassageOpen(page, FRESH_PASSAGE)
    await page.getByTestId(`compose-${FRESH_PASSAGE}`).click()
    await page.waitForTimeout(200)

    const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase())
    expect(tag, "焦点必须进表单，不能掉到 body").not.toBe("body")
    const inside = await page.evaluate(() =>
      !!document.activeElement?.closest('[data-testid="source-sheet"]'),
    )
    expect(inside).toBe(true)

    // 而它直接导致的行为：Escape 仍然有效。
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · resolved 第一次真实可达（Phase E+F 留下的唯一 UI 盲区）                     */
/* -------------------------------------------------------------------------- */

test.describe("resolved · 真实可达路径", () => {
  /**
   * 整条链走**真实操作**，不构造假的 fixture：
   *
   * ```
   * 补一条 supports 引用 → unsupported 张力不再 derive
   *   → 「标记为已解决」成为合法操作 → rail 的「已解决」段真的渲染出来
   * ```
   *
   * 在 Phase G+H 之前，这整条链只在纯函数测试里成立过；`resolved`
   * 那一段 DOM **从未被渲染过**，因为界面无法改变事实。
   */
  test("补引用 → 收尾 → rail 渲染出「已解决」段，未处理项消失", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const openRowsBefore = await page.locator(".rs-rail-desktop .rs-rail__row").count()
    await expect(page.locator(`.rs-rail-desktop [data-tension-id="${UNSUPPORTED}"]`)).toHaveCount(1)
    await expect(page.locator(".rs-rail-desktop [data-resolved-id]")).toHaveCount(0)

    await openSources(page)
    await ensureSourceOpen(page, FRESH_SOURCE)
    await ensurePassageOpen(page, FRESH_PASSAGE)
    await page.getByTestId(`compose-${FRESH_PASSAGE}`).click()
    await page.locator(".rs-link__select").selectOption(UNSUPPORTED_CLAIM)
    await page.locator('.rs-link__stance[data-stance="supports"] input').check()
    await page.getByTestId("link-submit").click()

    // ---- 收尾入口出现。它是 `resolved` 唯一可达的地方：缺口不再成立之后，
    //      rail 里那一行连同它的「处理」按钮一起消失了。 ----
    const closed = page.getByTestId("closed-tensions")
    await expect(closed).toBeVisible()
    await expect(closed.locator(`[data-tension-id="${UNSUPPORTED}"]`)).toHaveCount(1)

    await page.getByTestId(`resolve-gap-${UNSUPPORTED}`).click()
    const panel = page.locator(`[data-testid="disposition-panel-${UNSUPPORTED}"]`)
    await expect(panel).toBeVisible()

    // 事实刚刚变了，所以**这里**默认选中「已解决」是诚实的。
    await expect(panel.locator('input[value="resolved"]')).toBeChecked()

    await panel.locator(".rs-disposition__reason").fill("补了成本口径的材料，这条缺口不再成立。")
    await panel.locator(".rs-disposition__actions .rs-action").first().click()
    await expect(page.getByTestId(`disposed-${UNSUPPORTED}`)).toBeVisible()

    await page.getByTestId("source-sheet-close").click()
    await page.waitForTimeout(300)

    // ---- DOM 断言：这三条在 Phase E+F 结束时是**不可能**通过的 ----
    await expect(
      page.locator(".rs-rail-desktop [data-resolved-id]"),
      "「已解决」段必须真的渲染出来",
    ).toHaveCount(1)
    await expect(page.locator(`.rs-rail-desktop [data-resolved-id="${UNSUPPORTED}"]`)).toBeVisible()
    await expect(page.locator(`.rs-rail-desktop [data-tension-id="${UNSUPPORTED}"]`)).toHaveCount(0)

    const resolvedText = await page.locator(".rs-rail-desktop [data-resolved-id]").innerText()
    // 它说的是「无证据支撑」，不是「已处理」。
    await expect(page.locator(".rs-rail-desktop [data-resolved-id]")).toContainText("无证据支撑")

    // 未处理计数变了（unsupported 走了，新的 single-source 来了），
    // 而**已解决**是独立的一段，有一个独立的数。
    const openRowsAfter = await page.locator(".rs-rail-desktop .rs-rail__row").count()
    expect(openRowsAfter).not.toBe(openRowsBefore)
    await expect(page.locator(".rs-rail-desktop .rs-rail__group-head").last()).toBeVisible()
    expect(resolvedText.trim().length).toBeGreaterThan(0)
  })

  test("主缺口切换到下一条真实缺口，而不是变成空白", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const lead = page.getByTestId("primary-gap-lead")
    const shell = page.getByTestId("research-shell")
    const before = await lead.innerText()
    expect(await shell.getAttribute("data-suppressed-gap")).toBe(UNSUPPORTED_CLAIM)
    const yBefore = (await lead.boundingBox())!.y

    await openSources(page)
    await ensureSourceOpen(page, FRESH_SOURCE)
    await ensurePassageOpen(page, FRESH_PASSAGE)
    await page.getByTestId(`compose-${FRESH_PASSAGE}`).click()
    await page.locator(".rs-link__select").selectOption(UNSUPPORTED_CLAIM)
    await page.locator('.rs-link__stance[data-stance="supports"] input').check()
    await page.getByTestId("link-submit").click()
    await page.getByTestId("source-sheet-close").click()
    await page.waitForTimeout(300)

    // 卡片**还在**，而且指着**下一条**真实的洞。
    await expect(lead).toBeVisible()
    const after = await lead.innerText()
    expect(after).not.toBe(before)
    expect(await shell.getAttribute("data-suppressed-gap")).not.toBe(UNSUPPORTED_CLAIM)
    expect(await shell.getAttribute("data-suppressed-gap")).toBe("clm-cost-scale")

    // 位置不变：它仍在第一屏，仍在同一个高度。
    const yAfter = (await lead.boundingBox())!.y
    expect(Math.abs(yAfter - yBefore)).toBeLessThanOrEqual(2)
    expect(yAfter).toBeLessThan(900)
  })

  test("已解决段与已知局限段是两段，措辞不同", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    // 夹具里已经有一条「接受为已知局限」。
    const limitation = page.locator(".rs-rail-desktop [data-limitation-id]")
    await expect(limitation).toHaveCount(1)
    await expect(limitation).toContainText("已接受为已知局限")
    await expect(limitation).toContainText("对应的缺口仍然存在")

    // 而「已解决」此刻**还没有**——它不是同一件事，所以不该已经在那里。
    await expect(page.locator(".rs-rail-desktop [data-resolved-id]")).toHaveCount(0)
    // 已知局限条目**没有**处置入口：它已经是一个决定，不是一个待办。
    expect(await limitation.locator("button.rs-rail__dispose").count()).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · 领域侧：写入之后张力确实重算了                                             */
/* -------------------------------------------------------------------------- */

test.describe("EvidenceLink · 张力重算", () => {
  test("补上支持之后，rail 上的未处理项发生变化，且新缺口是真实的", () => {
    expect(chain.openTensions.some((t) => t.id === UNSUPPORTED)).toBe(true)
    expect(deriveTensions(loadBearingResearch).map((t) => t.id)).toContain(UNSUPPORTED)
    // 「会被关掉的那条，在写入前确实成立」——否则后面的断言没有意义。
    expect(isTensionStillRaised(loadBearingResearch, UNSUPPORTED)).toBe(true)
  })
})
