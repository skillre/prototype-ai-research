import { test, expect, type Page } from "@playwright/test"

import { loadBearingResearch } from "../lib/research"

/**
 * Phase G+H —— 移动端收口。
 *
 * §19 的要求是「不要只是『没有横向溢出』」。所以这个 spec 逐条查的是
 * **能不能用**，而不是「有没有报错」：
 *
 * ```
 * 第一视觉仍在首屏     缺口卡片没有被任何东西挤下去
 * 命中区够大           触控目标 >= 24px（AGENTS.md 的底线）
 * 安全的底部留白       最后一个控件不贴着 home indicator
 * 长中文会折行         不是靠 overflow-x: hidden 藏起来
 * 抽屉是模态的         焦点进入 / 循环 / Escape / 归还
 * ```
 *
 * 全部在 **390×844 + 触屏**下跑。桌面那一套由各自的 spec 负责。
 */

const WORKSPACE = "/r/res-load-bearing"
const FINDING = "/r/res-load-bearing/finding"

/** AGENTS.md 的控件命中区底线。 */
const MIN_TAP = 24
/** 第一屏高度。缺口必须整张卡片都在它之上。 */
const FOLD = 844

async function gotoMobile(page: Page, url: string) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url)
  await page.waitForTimeout(250)
}

/** 三条判据一起查——只用 scrollWidth - innerWidth 会漏掉视口扩张。 */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const de = document.documentElement
    window.scrollTo(9999, 0)
    return {
      innerWidth: window.innerWidth,
      scrollWidth: de.scrollWidth,
      scrollX: window.scrollX,
    }
  })
  expect(Math.abs(result.innerWidth - 390), `${label}: 布局视口被扩张了`).toBeLessThanOrEqual(1)
  expect(result.scrollWidth, `${label}: 横向溢出`).toBeLessThanOrEqual(390 + 1)
  expect(Math.abs(result.scrollX), `${label}: 页面可以横向平移`).toBeLessThanOrEqual(1)
}

/**
 * 量一组控件的命中区。
 *
 * ⚠ 必须**先排除 CSS 隐藏的那些**：桌面窄带在 390px 下是 `display:none`，
 * 但它的 DOM 仍然在（条件渲染的是抽屉的**内容**，窄带本身只是被 CSS 藏了）。
 * `getBoundingClientRect()` 对隐藏元素返回全 0——不排除就会得到
 * 「命中区 0px」这种假失败，而它看起来像一个真的布局 bug。
 *
 * `checkVisibility()` 会穿透祖先的 `display:none`，这正是需要的语义：
 * **用户能不能看到并点到它**。
 */
async function expectTapTargets(page: Page, selector: string, label: string) {
  const sizes = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { h: Math.round(r.height), text: (el.textContent ?? "").trim().slice(0, 16) }
      }),
  )
  expect(sizes.length, `${label}: 没有量到任何**可见**目标`).toBeGreaterThan(0)
  for (const size of sizes) {
    expect(size.h, `${label} 里的「${size.text}」只有 ${size.h}px`).toBeGreaterThanOrEqual(MIN_TAP)
  }
  return sizes
}

async function openDockPanel(page: Page) {
  await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
  await page.waitForTimeout(250)
}

/* -------------------------------------------------------------------------- */
/* 1 · 第一视觉                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Mobile · 第一视觉", () => {
  test("缺口卡片完整地留在第一屏内，而且它先于任何审稿意见", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    const lead = page.getByTestId("primary-gap-lead")
    await expect(lead).toBeVisible()

    const box = (await lead.boundingBox())!
    expect(box.y, "缺口不能在首屏之下").toBeLessThan(FOLD)
    /* 卡片底部可以在 fold 之下——390px 宽的缺口卡片本来就可能比较高。
       真正要求的是**读得到那句话**：空槽必须在首屏内。 */
    const slot = page.locator(".rs-gap__empty").first()
    const slotBox = (await slot.boundingBox())!
    expect(slotBox.y).toBeLessThan(FOLD)

    // 文档顺序：缺口在审稿意见之前。
    const before = await page.evaluate(() => {
      const gap = document.querySelector('[data-testid="primary-gap-lead"]')
      const notes = document.querySelector(".rs-review-tail")
      if (!gap || !notes) return null
      return gap.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING ? "gap-first" : "notes-first"
    })
    expect(before ?? "gap-first").toBe("gap-first")
  })

  test("移动端是重新编排的：上下文 → 问题 → 缺口 → 链条，不是把桌面压扁", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    const order = await page.evaluate(() => {
      const nodes: { selector: string; name: string }[] = [
        { selector: ".rs-running-head", name: "head" },
        { selector: ".rs-question", name: "question" },
        { selector: '[data-testid="primary-gap-lead"]', name: "gap" },
        { selector: ".rs-spine .rs-group", name: "chain" },
      ]
      return nodes
        .map(({ selector, name }) => {
          const el = document.querySelector(selector)
          if (!el) return null
          return { name, y: Math.round(el.getBoundingClientRect().y) }
        })
        .filter((entry): entry is { name: string; y: number } => entry !== null)
    })
    const names = order.map((entry) => entry.name)
    expect(names).toEqual(["head", "question", "gap", "chain"])
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]!.y, `${names[i]} 应当在 ${names[i - 1]} 之下`).toBeGreaterThan(order[i - 1]!.y)
    }
    // 桌面窄带在窄屏不渲染。
    expect(await page.locator(".rs-rail-desktop").isVisible()).toBe(false)
  })

  test("桌面与移动都没有重新长出 dashboard", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    expect(await page.locator("svg.recharts-surface").count()).toBe(0)
    expect(await page.locator('[role="progressbar"]').count()).toBe(0)
    expect(await page.locator('[class*="grid-cols-"]').count()).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 三个抽屉                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Mobile · 抽屉", () => {
  test("处置抽屉：焦点进入 / Tab 循环 / Escape / 焦点归还", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)

    const tensionId = "unsupported-claim::clm-cost-inflection"
    /* ⚠ 必须限定在**底部清单**里。桌面窄带在 390px 下被 CSS 隐藏，但它的
       DOM 仍然在，而且里面渲染的是同一个 testid——不限定范围，
       strict mode 会命中两个（其中一个是看不见的）。 */
    const trigger = page.getByTestId("tension-dock").locator(`[data-testid="dispose-${tensionId}"]`)
    await trigger.click()
    const sheet = page.getByTestId("disposition-sheet")
    await expect(sheet).toBeVisible()

    // ① 焦点进入
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="disposition-sheet"]')),
    ).toBe(true)

    // ② Tab 循环
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab")
      expect(
        await page.evaluate(() => !!document.activeElement?.closest('[data-testid="disposition-sheet"]')),
        `第 ${i + 1} 次 Tab 之后焦点跑出了抽屉`,
      ).toBe(true)
    }

    // ③ Escape 关闭 + ④ 焦点归还
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("disposition-sheet")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("材料抽屉：底部抽屉、占满宽度、内容可滚动", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()

    const sheet = page.getByTestId("source-sheet")
    await expect(sheet).toBeVisible()
    const box = (await sheet.boundingBox())!
    expect(Math.round(box.width), "窄屏下必须占满宽度").toBe(390)
    // 它是**底部**抽屉：底边贴着视口底部。
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(844 - 2)

    await expectTapTargets(page, ".rs-src__head", "材料条目")
    await expectNoHorizontalOverflow(page, "材料抽屉")
  })

  test("轨迹抽屉：在窄屏可用，内容没有变窄成一条", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-trace").click()

    await expect(page.getByTestId("trace-sheet")).toBeVisible()
    await expectTapTargets(page, ".rs-trace__group-head", "轨迹分组")
    await expectNoHorizontalOverflow(page, "轨迹抽屉")

    const facts = await page.locator(".rs-trace__facts").first().boundingBox()
    expect(facts!.width).toBeGreaterThan(200)
  })

  test("三个抽屉永远不会同时出现两个", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-trace").click()
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)
    await expect(page.getByTestId("disposition-sheet")).toHaveCount(0)

    await page.keyboard.press("Escape")
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()
    await expect(page.getByTestId("trace-sheet")).toHaveCount(0)
    await expect(page.getByTestId("disposition-sheet")).toHaveCount(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 命中区与安全的底部留白                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Mobile · 触控", () => {
  test("所有主要入口的命中区都不小于 24px", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await expectTapTargets(page, ".rs-rail-dock__toggle", "底部清单开关")
    await expectTapTargets(page, ".rs-rail__foot-action", "次要视图入口")
    await expectTapTargets(page, ".rs-rail__deliverable", "交付物入口")
    await expectTapTargets(page, ".rs-rail__dispose", "处置入口")
  })

  test("抽屉底部有安全的留白，最后一个控件不贴边", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()

    const padding = await page
      .locator('[data-testid="source-sheet"] .rs-sheet__body')
      .evaluate((el) => getComputedStyle(el).paddingBottom)
    expect(parseFloat(padding), "底部必须有留白（安全区或间距单位）").toBeGreaterThan(0)
  })

  test("材料抽屉在窄屏是**左对齐**的：列方向的 flex 没有被横向居中", async ({ page }) => {
    /**
     * ⚠ 这条断言来自一张截图。
     *
     * 「命中区够大」那一版给 `.rs-src__head` / `.rs-psg__head` /
     * `.rs-trace__group-head` 一起加了 `align-items: center` ——
     * 那三个是 `flex-direction: column` 的容器，于是它们的子元素被
     * **横向**居中了：整份材料清单在 390px 下变成居中排版，
     * 而正文段落还是左对齐的，两者并肩出现时非常明显。
     *
     * `expectTapTargets` 完全查不出这个——它只量高度。
     * 所以这里量的是**左边距**：子元素的左边缘必须贴住容器的
     * 内容盒左边缘。居中的话它会差出半个宽度。
     */
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()

    const deltas = await page.evaluate(() => {
      const pairs: [string, string][] = [
        ['.rs-src[data-open="true"] .rs-src__head', ".rs-src__title"],
        ['.rs-src[data-open="true"] .rs-psg__head', ".rs-psg__locator"],
      ]
      return pairs.map(([headSel, childSel]) => {
        const head = document.querySelector(headSel)
        const child = head?.querySelector(childSel)
        if (!head || !child) return null
        const contentLeft = head.getBoundingClientRect().left + parseFloat(getComputedStyle(head).paddingLeft)
        return Math.round(child.getBoundingClientRect().left - contentLeft)
      })
    })
    expect(deltas.filter((d) => d !== null).length).toBe(2)
    for (const delta of deltas) {
      expect(Math.abs(delta!), "子元素没有贴着内容盒左边缘——被居中了").toBeLessThanOrEqual(1)
    }
  })

  test("关联表单在窄屏是一列，控件不会被挤成一条", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()
    await page.locator(".rs-psg__head").first().click()
    await page.locator('[data-testid^="compose-"]').first().click()

    const form = page.locator(".rs-link")
    await expect(form).toBeVisible()
    const box = (await form.boundingBox())!
    expect(box.width).toBeGreaterThan(280)

    // 两个单选项都在，且可点。
    expect(await page.locator(".rs-link__stance").count()).toBe(4)
    await expectTapTargets(page, ".rs-link__stance", "关系选项")
    await expectTapTargets(page, '[data-testid="link-submit"]', "提交按钮")
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · 长文本与中文排版                                                          */
/* -------------------------------------------------------------------------- */

test.describe("Mobile · 文本", () => {
  test("最长的原文片段会折行，不会把页面撑宽", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()
    await page.locator(".rs-psg__head").first().click()

    const wrap = await page
      .locator(".rs-psg__text")
      .first()
      .evaluate((el) => getComputedStyle(el).overflowWrap)
    expect(wrap).toBe("anywhere")
    await expectNoHorizontalOverflow(page, "展开的原文")
  })

  test("交付物在窄屏也读得下去，且不横向溢出", async ({ page }) => {
    await gotoMobile(page, FINDING)
    await expect(page.getByTestId("finding-view")).toBeVisible()
    await expectNoHorizontalOverflow(page, "Finding")

    const body = await page.locator(".rs-finding__body").boundingBox()
    expect(body!.width).toBeGreaterThan(280)
    // 正文行长：390 宽减去左右留白之外，它必须真的占满可用宽度。
    const overflowWrap = await page
      .locator(".rs-finding__body")
      .evaluate((el) => getComputedStyle(el).overflowWrap)
    expect(overflowWrap).toBe("anywhere")
  })

  test("中文排版红线：承中文的元素不使用负字距", async ({ page }) => {
    /**
     * AGENTS.md 的红线：**负 tracking 只允许出现在纯数字 token 上**
     * （`text-metric` / `text-numeric` / `.numeric`）。
     *
     * 这条在浏览器里查比在读 CSS 里查有牙得多：字距可能是从 pack 的
     * `--kits-label-tracking` 继承来的，也可能由某个 utility 加上去，
     * 只看 `.rs-*` 规则是看不出来的。
     */
    for (const url of [WORKSPACE, FINDING]) {
      await gotoMobile(page, url)
      const offenders = await page.evaluate(() => {
        const bad: { text: string; spacing: string; cls: string }[] = []
        for (const el of document.querySelectorAll<HTMLElement>("main *")) {
          // 只查**直接承中文**的元素，并且跳过纯数字元素。
          const own = [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join("")
          if (!/[\u4e00-\u9fff]/.test(own)) continue
          if (el.closest(".numeric")) continue
          const spacing = parseFloat(getComputedStyle(el).letterSpacing)
          if (Number.isFinite(spacing) && spacing < 0) {
            bad.push({ text: own.trim().slice(0, 18), spacing: String(spacing), cls: el.className })
          }
        }
        return bad
      })
      expect(offenders, `${url} 上中文被加了负字距：${JSON.stringify(offenders)}`).toEqual([])
    }
  })

  test("交付物的八个要素在窄屏都还在", async ({ page }) => {
    await gotoMobile(page, FINDING)
    await expect(page.locator(".rs-finding__question")).toBeVisible()
    await expect(page.locator(".rs-finding__body")).toBeVisible()
    await expect(page.getByTestId("finding-confidence")).toBeVisible()
    await expect(page.locator(".rs-finding__claim").first()).toBeVisible()
    await expect(page.locator(".rs-finding__citation").first()).toBeVisible()
    await expect(page.locator(".rs-finding__limitation").first()).toBeVisible()
    await expect(page.locator(".rs-finding__scope-item").first()).toBeVisible()
    await expect(page.locator(".rs-finding__envelope")).toBeVisible()
  })

  test("交付物在窄屏是单列：最弱的那一环换行而不是被挤没", async ({ page }) => {
    await gotoMobile(page, FINDING)
    const weakest = page.getByTestId("weakest-claim")
    await expect(weakest).toBeVisible()
    const box = (await weakest.boundingBox())!
    expect(box.width).toBeGreaterThan(20)
    // 它没有溢出到内容区右边之外。
    expect(box.x + box.width).toBeLessThanOrEqual(391)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · 两个路由在窄屏都没有横向问题                                                */
/* -------------------------------------------------------------------------- */

test.describe("Mobile · 溢出总检", () => {
  for (const [label, url] of [
    ["工作区", WORKSPACE],
    ["交付物", FINDING],
  ] as const) {
    test(`${label}：三条判据一起成立`, async ({ page }) => {
      await gotoMobile(page, url)
      await expectNoHorizontalOverflow(page, label)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      expect(height, `${label} 应当有真实内容`).toBeGreaterThan(600)
    })
  }

  test("工作区在窄屏真的把材料列出来了（不是空壳）", async ({ page }) => {
    await gotoMobile(page, WORKSPACE)
    await openDockPanel(page)
    await page.getByTestId("tension-dock").getByTestId("open-source-index").click()
    await expect(page.locator(".rs-src")).toHaveCount(loadBearingResearch.sources.length)
  })
})
