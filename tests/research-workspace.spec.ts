import { test, expect, type Page } from "@playwright/test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  ALL_STANCES,
  buildEvidenceAccessibleName,
  getRelationPresentation,
  loadBearingResearch,
} from "../lib/research"
import {
  VISIBLE_EVIDENCE_LIMIT,
  projectArgumentChain,
  projectClaimEvidence,
  type ClaimEvidence,
} from "../lib/research-ui"
import { RESEARCH_LABELS, REVIEWER_COPY } from "../lib/research-ui/copy"

/**
 * 第一屏（Argument Chain）—— Phase D。
 *
 * ## 这个 spec 守的是什么
 *
 * 不是「页面能不能渲染」，而是**这一屏是不是它声称的那一屏**：
 *
 *   1. 第一视觉是**缺口**，不是 dashboard、不是 KPI、不是卡片网格；
 *   2. 关系语义**只经过关系契约**——UI 里不准有 `stance === "…"`；
 *   3. 证据四态在灰度下可分辨（形状 + 词 + 序，不是颜色）；
 *   4. 390×844 折叠线以上能看到 context + question + 最大缺口；
 *   5. 内容默认可见，不依赖 IntersectionObserver；
 *   6. 触屏上数据游标关闭，桌面细指针上开启。
 *
 * ## 为什么断言里到处是 `data-*` 而不是 class
 *
 * `data-*` 是**语义**（这一行的 form 是什么、这条论断的缺口是否被折叠），
 * class 是**实现**。断言语义意味着换一套样式不会被误判为回归，
 * 而语义真的变了（form 取值变了）时它一定会失败。
 */

const RESEARCH_ID = loadBearingResearch.research.id
const ROUTE = `/r/${RESEARCH_ID}`

/** 数据集里那条真正没有证据的论断。它是本屏的主角，不是随便挑的一条。 */
const UNSUPPORTED_CLAIM_ID = "clm-cost-inflection"

/**
 * 与页面用**同一套**组装函数与**同一份词典绑定**。
 *
 * 这里刻意不另写一份 labels/copy：测试里自己拼一份，就等于把
 * 「界面到底显示了什么」变成两个可能漂移的说法——而那种漂移不会报错。
 * `@/lib/research-ui/copy` 的存在就是为了让两边能共用同一份。
 */
const chain = projectArgumentChain(loadBearingResearch, RESEARCH_LABELS, REVIEWER_COPY)

function claims() {
  return chain.claims
}

async function gotoResearch(page: Page) {
  await page.goto(ROUTE)
  await expect(page.getByTestId("research-shell")).toBeVisible()
}

/* -------------------------------------------------------------------------- */
/* 1 · 路由与骨架                                                              */
/* -------------------------------------------------------------------------- */

test.describe("1 · 研究路由", () => {
  test("主工作区加载，并且只有这一条产品路由", async ({ page }) => {
    const response = await page.goto(ROUTE)
    expect(response?.status(), `${ROUTE} 必须存在`).toBe(200)
    await expect(page.getByTestId("research-shell")).toBeVisible()
  })

  test("不存在的 researchId 走 404，而不是渲染一个空壳", async ({ page }) => {
    const response = await page.goto("/r/res-does-not-exist")
    expect(response?.status()).toBe(404)
    /* `dynamicParams = false` 让这一条 URL 根本不在路由表里，因此渲染的是
       **根** not-found（`app/not-found.tsx`），而不是 `app/r/[researchId]/not-found.tsx`。
       这一点是实测出来的，不是猜的——所以断言必须指向真正渲染的那个。 */
    await expect(page.getByTestId("app-not-found")).toBeVisible()
    // 兜底必须给出真实存在的出口，不能是死胡同。
    await expect(page.getByRole("link", { name: "打开研究工作区" }).first()).toHaveAttribute(
      "href",
      ROUTE,
    )
    // 而且它要说清是哪一层不存在：这一屏存在，是**这项研究**不存在。
    await expect(page.getByTestId("app-not-found")).toContainText("这项研究不存在")
  })

  test("没有为「对象」另开路由——对象不是 route", async () => {
    // 这一条是**结构性**断言，不是风格偏好：把 sources / claims / tensions
    // 各开一条 route，这个产品就会滑向后台管理系统，而那正是 firstVisual 要避免的形状。
    const app = join(process.cwd(), "app")
    const routes: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/^page\.tsx?$/.test(entry)) {
          routes.push(full.slice(app.length).replace(/\/page\.tsx?$/, "") || "/")
        }
      }
    }
    walk(app)
    const forbidden = ["sources", "claims", "tensions", "ai", "settings", "dashboard"]
    for (const banned of forbidden) {
      expect(routes, `不应存在 /${banned} 路由`).not.toContain(`/${banned}`)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · 第一视觉                                                                */
/* -------------------------------------------------------------------------- */

test.describe("2 · 第一视觉是缺口", () => {
  test("研究问题可见并且是 sticky 的锚", async ({ page }) => {
    await gotoResearch(page)
    await expect(page.locator(".rs-question__text")).toHaveText(chain.anchor.questionText)
    expect(await page.locator(".rs-question").evaluate((el) => getComputedStyle(el).position)).toBe(
      "sticky",
    )
  })

  test("Running Head 是单行研究上下文，不是 TopNav", async ({ page }) => {
    await gotoResearch(page)
    const head = page.locator(".rs-running-head")
    // 研究上下文：工作代号 + 范围（含被排除的）+ 未处理张力数。
    await expect(head).toContainText(loadBearingResearch.research.scope.out[0]!)
    await expect(head).toContainText(`${chain.anchor.disposal.open}`)
    // 它不该长成外壳：没有导航、没有账户、没有主题开关。
    // （Phase G+H 新增的交付物入口刻意**不在这里**——它落在窄带底部。
    //   这条断言因此一字未改，它仍然是「Running Head 里没有链接」。）
    expect(await head.locator("a, nav").count()).toBe(0)
    expect(await head.locator("input, select").count()).toBe(0)
  })

  test("无证据支撑的那条论断是一个虚线空槽", async ({ page }) => {
    await gotoResearch(page)
    const claim = page.locator(`[data-claim-id="${UNSUPPORTED_CLAIM_ID}"]`)
    await expect(claim).toBeVisible()
    await expect(claim.locator(".rs-gap__empty")).toHaveText("尚无证据支撑")

    const style = await claim.locator(".rs-gap__slot").evaluate((el) => {
      const cs = getComputedStyle(el)
      return { style: cs.borderTopStyle, width: cs.borderTopWidth }
    })
    expect(style.style, "空槽必须是虚线——实线属于有内容的面板").toBe("dashed")
    expect(style.width).not.toBe("0px")

    // 无证据 = 真的没有证据链接。这条断言把 UI 与 domain 绑在一起：
    // 数据集改了而空槽没跟着改时，它会失败。
    expect(claims().find((c) => c.claim.id === UNSUPPORTED_CLAIM_ID)?.evidence.length).toBe(0)
  })

  test("缺口说得出「需要哪类材料」，而且那句话来自 domain", async ({ page }) => {
    await gotoResearch(page)
    const lead = page.getByTestId("primary-gap-lead")
    await expect(lead).toBeVisible()
    await expect(lead).toContainText("需要哪类材料")
    // 预测型论断 → 一手材料 + 年份下限（见 lib/research-ui/projections.ts 的表）
    await expect(lead).toContainText("一手材料")
    await expect(lead).toContainText("2024")
    // 它必须说明自己属于哪个子问题，否则「需要什么」没有靶心。
    await expect(lead).toContainText("B 路线的成本曲线是否已到拐点？")
  })

  test("缺口在第一屏，且不在 fold 以下", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const box = await page.getByTestId("primary-gap-lead").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y, "缺口必须出现在首屏").toBeLessThan(900)
  })

  test("页面里没有 dashboard 语言：没有 KPI 数字卡、没有图表、没有进度百分比", async ({ page }) => {
    await gotoResearch(page)
    // 这几条对应 visual-manifest 的 avoid 列表。它们是**否定断言**，
    // 因此检查的是「不存在」而不是「存在且长得对」。
    expect(await page.locator("svg.recharts-surface").count()).toBe(0)
    expect(await page.locator("[role='progressbar']").count()).toBe(0)
    // 卡片网格：三个及以上等宽列并排的容器，就是 dashboard 的骨架。
    const grids = await page.locator(".rs-shell [class*='grid-cols-']").count()
    expect(grids, "第一屏不应出现列网格（那是卡片网格的骨架）").toBe(0)
    // 唯一允许的「读数」是未处理张力数，而且它是一个文字标签，不是一个巨型指标。
    expect(await page.locator(".rs-shell .text-metric, .rs-shell .kits-data").count()).toBe(0)
  })

  test("缺口比已完成内容更醒目——但靠的是结构，不是光", async ({ page }) => {
    await gotoResearch(page)
    // 空槽边框用「强规则线」，而普通分隔线用弱规则线：对比度来自**哪一级线**，
    // 不来自 glow / 红卡 / 大图标。
    const contrast = await page.evaluate(() => {
      const gap = document.querySelector(".rs-gap-lead .rs-gap__slot")!
      const ev = document.querySelector(".rs-evidence")!
      return {
        gapBorder: getComputedStyle(gap).borderTopColor,
        gapWidth: getComputedStyle(gap).borderTopWidth,
        hairlineBorder: getComputedStyle(ev).borderTopColor,
      }
    })
    expect(contrast.gapWidth, "空槽必须真的有边框").not.toBe("0px")
    expect(
      contrast.gapBorder,
      "空槽的边必须比普通分隔线更重——它是主角",
    ).not.toBe(contrast.hairlineBorder)

    // 而且**没有光**：ambient / hero / chart glow 在本工作区内全部被中和（F4）。
    const glow = await page.evaluate(() => {
      const root = document.querySelector(".rs-shell")!
      const cs = getComputedStyle(root)
      return {
        hero: cs.getPropertyValue("--hero-base").trim(),
        brand: cs.getPropertyValue("--ambient-brand").trim(),
        warm: cs.getPropertyValue("--ambient-warm").trim(),
        grid: cs.getPropertyValue("--ambient-grid").trim(),
        ring: cs.getPropertyValue("--ambient-ring").trim(),
        chart: cs.getPropertyValue("--chart-glow").trim(),
        kits: cs.getPropertyValue("--kits-color-glow").trim(),
      }
    })
    for (const [name, value] of Object.entries(glow)) {
      expect(value, `F4：${name} 必须被中和为 transparent`).toBe("transparent")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · relation contract 是唯一入口                                            */
/* -------------------------------------------------------------------------- */

test.describe("3 · 关系只经过契约", () => {
  test("四个 stance 的界面词全部出现在页面上", async ({ page }) => {
    await gotoResearch(page)
    // `qualifies` 在数据集里只出现在 clm-capacity-crossed 上，
    // 而它被折在「还有 N 条」后面——所以先展开。
    await page.locator("[data-testid^='evidence-more-']").first().click()
    for (const stance of ALL_STANCES) {
      const label = getRelationPresentation(stance).label
      await expect(
        page.locator(`.rs-evidence__label:text-is("${label}")`).first(),
        `stance ${stance} 的词「${label}」必须在页面上`,
      ).toBeVisible()
    }
  })

  test("每一条证据的形状来自契约的 form，不是组件里的判断", async ({ page }) => {
    await gotoResearch(page)
    const rendered = await page.locator(".rs-evidence__row").evaluateAll((rows) =>
      rows.map((row) => ({
        form: row.getAttribute("data-form"),
        label: row.getAttribute("data-stance-label"),
        key: row.getAttribute("data-form-key"),
      })),
    )
    expect(rendered.length).toBeGreaterThan(0)

    const byLabel = new Map(ALL_STANCES.map((s) => [getRelationPresentation(s).label, s]))
    for (const row of rendered) {
      const stance = byLabel.get(row.label!)
      expect(stance, `未知的 stance 词：${row.label}`).toBeTruthy()
      const presentation = getRelationPresentation(stance!)
      expect(row.form).toBe(presentation.form)
      expect(row.key).toBe(`${presentation.form}:${presentation.order}`)
    }
  })

  test("证据顺序 = 契约的 order（反驳 → 支持 → 限定 → 背景），JSX 里没有手写顺序", async ({
    page,
  }) => {
    await gotoResearch(page)
    // 直接对**组装结果**断言：这是 UI 真正渲染的那个数组。
    for (const projection of claims()) {
      const orders = projection.evidence.map((item) => item.presentation.order)
      expect(orders, `${projection.claim.id} 的证据必须按契约 order 升序`).toEqual(
        [...orders].sort((a, b) => a - b),
      )
    }
    // 逐条过滤的写法（`.filter(stance === …)`）是最容易混进来的第二份顺序实现。
    // 契约里只允许一处出现这样的判断。
    const source = readFileSync(join(process.cwd(), "lib/research-ui/projections.ts"), "utf8")
    expect(source).not.toMatch(/stance\s*===?\s*["']/)
  })

  test("窄屏标签由契约模板生成", async ({ page }) => {
    await gotoResearch(page)
    const labels = await page
      .locator(".rs-evidence__row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-mobile-label")))
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      const stance = ALL_STANCES.find((s) => label!.startsWith(getRelationPresentation(s).label))
      expect(stance, `窄屏标签必须以 stance 词开头：${label}`).toBeTruthy()
    }
  })

  test("产品 UI 里没有对 stance 字面量的分支判断", () => {
    // 这是 relation-contract.spec.ts §14 那条前向守卫的**加强版**：
    // 它同时扫 `components/research/`（Phase D 新增的那一层）。
    const roots = ["app", "components", "lib/research-ui"]
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir))) {
        const rel = join(dir, entry)
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(entry)) {
          const code = readFileSync(join(process.cwd(), rel), "utf8")
          for (const stance of ALL_STANCES) {
            if (new RegExp(`stance\\s*===?\\s*["']${stance}["']`).test(code)) {
              offenders.push(`${rel}: stance === "${stance}"`)
            }
          }
        }
      }
    }
    for (const root of roots) walk(root)
    expect(offenders, "UI 与组装层都不得自行判断 stance —— 必须消费 getRelationPresentation()").toEqual([])
  })

  test("可访问名由 buildEvidenceAccessibleName 生成（含 stance 词 + locator + 原文）", async ({
    page,
  }) => {
    await gotoResearch(page)
    const names = await page
      .locator(".rs-evidence__row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toBeTruthy()
      const stance = ALL_STANCES.find((s) => name!.startsWith(getRelationPresentation(s).label))
      expect(stance, `可访问名必须以 stance 词开头：${name}`).toBeTruthy()
    }

    // 与契约函数逐字比对（用真实数据集，因此不是自证）。
    //
    // 比对对象必须**由 DOM 定位**：`data-form-key` 在同一 stance 上会重复
    // （支持类证据往往有两条），`.first()` 命中的未必是那条 link。
    // 所以用产品渲染在行上的身份属性把两者绑起来，而不是靠下标。
    const probe = page.locator(".rs-evidence__row").first()
    const probeLabel = await probe.getAttribute("aria-label")
    const probeClaimId = await probe.evaluate((el) =>
      el.closest("[data-claim-id]")!.getAttribute("data-claim-id"),
    )
    const probeEvidence = claims()
      .find((c) => c.claim.id === probeClaimId)!
      .evidence.find(
        (item) =>
          buildEvidenceAccessibleName(item.stance, item.locatorLabel, item.passageText) ===
          probeLabel,
      )
    expect(probeEvidence, "行上的可访问名必须由契约函数逐字生成").toBeTruthy()

    const expected = buildEvidenceAccessibleName(
      probeEvidence!.stance,
      probeEvidence!.locatorLabel,
      probeEvidence!.passageText,
    )
    await expect(probe).toHaveAttribute("aria-label", expected)
  })

  test("有反驳的论断带一句显式播报（逆流位置是纯视觉信号）", async ({ page }) => {
    await gotoResearch(page)
    const contested = claims().find((c) => c.flags.includes("contradictory-evidence"))!
    const announcement = getRelationPresentation("contradicts").a11y.claimAnnouncement
    expect(announcement, "契约必须给 contradicts 一句播报").toBeTruthy()

    const claim = page.locator(`[data-claim-id="${contested.claim.id}"]`)
    const node = claim.locator("[data-contradiction-announcement]")
    await expect(node).toHaveCount(1)
    await expect(node).toHaveText(announcement!)

    // 它必须是**视觉隐藏但语义存在**：屏幕阅读器读得到，
    // 而且不能被 aria-hidden 剪掉（剪掉就等于没播报）。
    expect(await node.evaluate((el) => el.getAttribute("aria-hidden"))).toBeNull()
    expect(await node.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(2)

    // 反向对照：没有反驳的论断不该有这句播报。
    const clean = claims().find((c) => !c.flags.includes("contradictory-evidence"))!
    await expect(
      page.locator(`[data-claim-id="${clean.claim.id}"] [data-contradiction-announcement]`),
    ).toHaveCount(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · 证据交互                                                                */
/* -------------------------------------------------------------------------- */

test.describe("4 · 证据就地展开", () => {
  test("点击证据展开原文，不跳 route", async ({ page }) => {
    await gotoResearch(page)
    const urlBefore = page.url()

    const row = page.locator(".rs-evidence__row").first()
    /* 展开区必须落在**被点的那一条**上，而不是随便某一条。
       所以先问 DOM：这一行属于哪条论断；再问组装结果：那条论断的第一条证据是谁。
       不能直接取「第一个有证据的 claim」——渲染顺序与数据顺序不同，
       第一版就是这么写的，于是断言指向了另一条证据。 */
    const claimId = await row.evaluate((el) =>
      el.closest("[data-claim-id]")!.getAttribute("data-claim-id"),
    )
    const linkId = claims().find((c) => c.claim.id === claimId)!.evidence[0]!.linkId

    await expect(row).toHaveAttribute("aria-expanded", "false")
    await row.click()
    await expect(row).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator(`[data-testid="evidence-reveal-${linkId}"]`)).toBeVisible()
    expect(page.url(), "点击证据**不得**离开 Argument Chain").toBe(urlBefore)

    // 再点一次收起。
    await row.click()
    await expect(row).toHaveAttribute("aria-expanded", "false")
    await expect(page.locator(`[data-testid="evidence-reveal-${linkId}"]`)).toHaveCount(0)
  })

  test("同时只展开一条原文（否则一条论断会突然长到两屏高）", async ({ page }) => {
    await gotoResearch(page)
    const rows = page.locator(".rs-claim").first().locator(".rs-evidence__row")
    await rows.nth(0).click()
    await expect(page.locator(".rs-evidence__reveal")).toHaveCount(1)
    await rows.nth(1).click()
    await expect(page.locator(".rs-evidence__reveal")).toHaveCount(1)
  })

  test("证据可以被键盘激活", async ({ page }) => {
    await gotoResearch(page)
    const row = page.locator(".rs-evidence__row").first()
    await row.focus()
    await page.keyboard.press("Enter")
    await expect(row).toHaveAttribute("aria-expanded", "true")
  })

  test("默认证据条数受控，其余折进「还有 N 条」", async ({ page }) => {
    await gotoResearch(page)
    const foldable = claims().find((c) => c.evidence.length > VISIBLE_EVIDENCE_LIMIT)
    expect(foldable, `数据集里应有一条超过 ${VISIBLE_EVIDENCE_LIMIT} 条证据的论断`).toBeTruthy()

    const claim = page.locator(`[data-claim-id="${foldable!.claim.id}"]`)
    await expect(claim.locator(".rs-evidence__row")).toHaveCount(VISIBLE_EVIDENCE_LIMIT)
    const more = claim.locator("[data-testid^='evidence-more-']")
    await expect(more).toContainText(`还有 ${foldable!.evidence.length - VISIBLE_EVIDENCE_LIMIT} 条`)
    await more.click()
    await expect(claim.locator(".rs-evidence__row")).toHaveCount(foldable!.evidence.length)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 · Tension Rail                                                            */
/* -------------------------------------------------------------------------- */

test.describe("5 · Tension Rail", () => {
  test("桌面窄带：未处理的张力可处置，已处置的**不在**未处理段里", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const rail = page.locator(".rs-rail-desktop")
    await expect(rail).toBeVisible()

    await expect(rail.locator(".rs-rail__row")).toHaveCount(chain.openTensions.length)

    /*
     * ⚠ Phase E 修改了这条断言，理由是本阶段的核心要求。
     *
     * Phase D 时这里断言一句「已闭合 N 项」——它把 resolved 与
     * accepted-as-limitation 合并成了一个数。Phase E 的 §4 明确要求
     * 这两个状态**不得**被合并显示，因为它们说的不是一件事：
     * 「事实变了」和「我决定带着它交付」。
     *
     * 所以那句合并计数被拆成了两段（已知局限 / 已解决），
     * 这条测试也跟着改成断言**拆分后的结构**——它比原来更强：
     * 原来只要求「已闭合的不出现在未处理里」，现在还要求
     * 「它出现在属于它的那一段里」。
     */
    for (const limitation of chain.limitations) {
      await expect(
        rail.locator(`[data-limitation-id="${limitation.tensionId}"]`),
        `${limitation.tensionId} 被接受为局限，必须出现在「已知局限」段`,
      ).toHaveCount(1)
    }

    for (const resolved of chain.resolvedTensions) {
      await expect(rail.locator(`[data-resolved-id="${resolved.tensionId}"]`)).toHaveCount(1)
    }
  })

  test("rail 里的 kind 词来自界面词表，不是 domain 的英文标识", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const kindTexts = await page
      .locator(".rs-rail-desktop .rs-rail__kind")
      .evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    expect(kindTexts.length).toBeGreaterThan(0)
    for (const text of kindTexts) {
      expect(text, "rail 不应该把 domain 的 kind 标识直接印给用户").not.toMatch(
        /^[a-z-]+$/,
      )
    }
  })

  test("点击 rail 条目把对应论断滚进视野并标记它", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    // 挑一条在当前视口之外的张力（否则没有滚动可言）。
    const deepTension = chain.openTensions.find((tension) => {
      const projection = claims().find((c) => c.claim.id === tension.subject.claimId)
      return (projection?.index ?? 0) > 2
    })
    expect(deepTension, "数据集里应有一条落在链条深处的张力").toBeTruthy()

    const item = page.locator(`.rs-rail-desktop [data-tension-id="${deepTension!.id}"]`)
    await item.click()
    await expect(page.locator(".rs-shell")).toHaveAttribute(
      "data-testid",
      "research-shell",
    )

    const claim = page.locator(`[data-claim-id="${deepTension!.subject.claimId}"]`)
    await expect(claim).toBeInViewport()
    await expect(page.locator("[data-focused-claim]")).toHaveAttribute(
      "data-focused-claim",
      deepTension!.subject.claimId,
    )
  })

  test("移动端 rail 是底部清单：开关、列表、滚到论断", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    const dock = page.getByTestId("tension-dock")
    await expect(dock).toBeVisible()
    const toggle = dock.locator(".rs-rail-dock__toggle")
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    // 关闭时里面的按钮**不在文档里**（不是 CSS 藏起来——那样仍然可被 Tab 到）。
    await expect(dock.locator(".rs-rail__item")).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(dock.locator(".rs-rail__item")).toHaveCount(chain.openTensions.length)

    await dock.locator(".rs-rail__item").first().click()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(dock.locator(".rs-rail__item")).toHaveCount(0)

    // 桌面那一栏在窄屏不参与布局。
    expect(await page.locator(".rs-rail-desktop").evaluate((el) => getComputedStyle(el).display)).toBe(
      "none",
    )
  })
})

/* -------------------------------------------------------------------------- */
/* 6 · 签名组件：DataCursor（桌面细指针）/ InsightReveal                        */
/* -------------------------------------------------------------------------- */

test.describe("6 · 签名组件", () => {
  test("桌面细指针：数据游标激活，且证据行声明了读数标签", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const root = page.locator(".kits-cursor-root").first()
    await expect(root).toHaveAttribute("data-kits-active", "true")
    expect(await root.evaluate((el) => el.className)).toContain("hide-native")

    const row = page.locator(".rs-evidence__row").first()
    /* 读数标签来自产品数据（locator + 来源），由指针层显示。
       断言用**同一行**的属性互相印证：`data-mobile-label` 与读数标签
       共享同一个 locator，所以它们必须指向同一个定位。 */
    await expect(row).toHaveAttribute("data-cursor", "inspect")
    const label = await row.getAttribute("data-cursor-label")
    const mobileLabel = await row.getAttribute("data-mobile-label")
    expect(label).toBeTruthy()
    expect(label!.length).toBeLessThanOrEqual(48)
    expect(mobileLabel).toBeTruthy()
    const locator = mobileLabel!.split(" · ")[1]
    expect(locator, "两处读数必须描述同一个 locator").toBeTruthy()
    expect(label).toContain(locator!)
  })

  test("触屏：数据游标关闭，且不渲染指示器节点", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await page.goto(ROUTE)
    await expect(page.getByTestId("research-shell")).toBeVisible()

    const root = page.locator(".kits-cursor-root").first()
    await expect(root).toHaveAttribute("data-kits-active", "false")
    // 未激活时组件不渲染指示器——不是「渲染了但透明」。
    await expect(page.locator(".kits-cursor")).toHaveCount(0)

    // 证据**不依赖 hover**：四态的词与原文在触屏上照常可读。
    await expect(page.locator(".rs-evidence__row").first()).toBeVisible()
    await expect(page.locator(".rs-evidence__label").first()).toBeVisible()
    await context.close()
  })

  test("reduced-motion：内容默认可见，不依赖 IntersectionObserver", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    })
    const page = await context.newPage()
    await page.goto(ROUTE)
    await expect(page.getByTestId("research-shell")).toBeVisible()

    // 揭示层不得进入「已动画」状态——那是内容被 JS 掌握的唯一开关。
    await expect(page.locator(".kits-reveal--animated")).toHaveCount(0)

    const probe = await page.evaluate(() => {
      const main = document.querySelector("main")!
      let faded = 0
      for (const child of main.querySelectorAll("*")) {
        const cs = getComputedStyle(child)
        if (parseFloat(cs.opacity) === 0 && (child.textContent ?? "").trim().length > 0) faded += 1
      }
      return { faded, textLength: (main.innerText ?? "").trim().length }
    })
    expect(probe.textLength).toBeGreaterThan(200)
    expect(probe.faded, "reduced-motion 下不得有任何内容停在 opacity: 0").toBe(0)

    // 论断与证据都在（不靠滚动触发才存在）。
    await expect(page.locator(".rs-claim").first()).toBeVisible()
    await expect(page.locator(".rs-evidence__row").first()).toBeAttached()
    await context.close()
  })

  test("reveal 只在「已动画」状态隐藏内容——JS 挂掉时内容仍然可见", async ({ page }) => {
    await gotoResearch(page)

    const state = await page.evaluate(() => {
      const reveals = [...document.querySelectorAll(".kits-reveal")]
      const pending = reveals.filter(
        (el) =>
          el.classList.contains("kits-reveal--animated") &&
          el.getAttribute("data-kits-visible") !== "true",
      )
      return {
        count: reveals.length,
        pendingCount: pending.length,
        /** 折叠线以上是否还有未揭示的层——那才是真正的「内容不可见」。 */
        pendingAboveFold: pending.filter((el) => el.getBoundingClientRect().top < innerHeight)
          .length,
      }
    })

    // 签名组件在场，而且**视口内的内容已经落定**：揭示延后只发生在折叠线以下。
    expect(state.count).toBeGreaterThan(0)
    expect(
      state.pendingAboveFold,
      "折叠线以上的内容不得停在未揭示状态——用户第一眼不该看到空白",
    ).toBe(0)

    /* 关键的一条：**去掉 JS** 时内容是否仍然可见。
       InsightReveal 的三层降级里，第三层是「隐藏只在已动画模式下发生」。
       模拟 JS 失败 = 手动摘掉那个 class，然后断言全部回到可见。
       这比「观察它现在恰好是可见的」强得多——后者只是在描述一次巧合。 */
    const afterJsFailure = await page.evaluate(() => {
      const reveals = [...document.querySelectorAll(".kits-reveal")]
      for (const el of reveals) el.classList.remove("kits-reveal--animated")
      return reveals.map((el) => {
        const own = parseFloat(getComputedStyle(el).opacity)
        const children = [...el.children].map((c) => parseFloat(getComputedStyle(c).opacity))
        const descendants = [...el.querySelectorAll("li, section, article")].map((c) =>
          parseFloat(getComputedStyle(c).opacity),
        )
        return Math.min(own, ...children, ...descendants)
      })
    })
    expect(
      Math.min(...afterJsFailure),
      "JS 失败时整条链条必须可见——不得有任何一层停在 opacity 0",
    ).toBe(1)

    await expect(page.locator(".rs-claim").first()).toBeVisible()
  })

  test("signature component 不超过两个", async () => {
    // firstVisual 的规则：一屏一个主角，签名组件至多两个。
    // 第三个会被断言拦住——这是防「每个小元素都 Reveal」的机械手段。
    const used = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir))) {
        const rel = join(dir, entry)
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(entry)) {
          const code = readFileSync(join(process.cwd(), rel), "utf8")
          for (const match of code.matchAll(/from\s+"@\/lib\/kits\/adapters\/([\w-]+)"/g)) {
            const asset = match[1]!
            // style-pack / data 是 pack 的缝，不是签名组件。
            if (asset.startsWith("style-") || asset === "style-pack" || asset === "data") continue
            used.add(asset)
          }
        }
      }
    }
    walk("app")
    walk("components")
    expect([...used].sort()).toHaveLength(2)
  })
})

/* -------------------------------------------------------------------------- */
/* 7 · 移动端重构图                                                            */
/* -------------------------------------------------------------------------- */

test.describe("7 · 390×844", () => {
  test("折叠线以上能看到：研究上下文 + 问题 + 最大缺口", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)

    const fold = 844
    const seen = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox()
      return box ? box.y < fold : false
    }

    expect(await seen(".rs-running-head"), "研究上下文必须在 fold 以上").toBe(true)
    expect(await seen(".rs-question"), "研究问题必须在 fold 以上").toBe(true)
    expect(await seen("[data-testid='primary-gap-lead']"), "最大缺口必须在 fold 以上").toBe(true)

    // 缺口的那句话本身也要在 fold 以上——只有一个虚线框是不够的。
    const emptyBox = await page.locator(".rs-gap-lead .rs-gap__empty").boundingBox()
    expect(emptyBox).not.toBeNull()
    expect(emptyBox!.y, "「尚无证据支撑」必须在 fold 以上").toBeLessThan(fold)
  })

  test("状态标签不折行成竖排（390px 下中文竖排 = 不可读）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)
    // 「断点」两个字被挤成一列是真实发生过的一版（列宽写死了）。
    // 空槽里只有一个 `.rs-gap__break`——首屏卡片曾经在外面又渲染了一个，
    // 于是页面上出现两个「断点」。那已修掉，所以这里能用 strict locator。
    const box = await page.locator(".rs-gap-lead .rs-gap__break").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width, "标签宽度必须大于一个字——否则中文竖排了").toBeGreaterThan(24)
  })

  test("横向不溢出，且不能被左右平移", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)
    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(Math.abs(layout.innerWidth - 390)).toBeLessThanOrEqual(1)
    expect(layout.scrollWidth - 390).toBeLessThanOrEqual(1)
    const scrollX = await page.evaluate(async () => {
      window.scrollTo(9999, 0)
      await new Promise((r) => requestAnimationFrame(() => r(undefined)))
      const value = window.scrollX
      window.scrollTo(0, 0)
      return value
    })
    expect(Math.abs(scrollX)).toBeLessThanOrEqual(1)
  })

  test("首屏卡片折叠掉的那条缺口，在链条里不重复画空槽（但理由仍在）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoResearch(page)
    const claim = page.locator(`[data-claim-id="${chain.primaryGap!.claim.claim.id}"]`)
    await expect(claim).toHaveAttribute("data-gap-suppressed", "true")
    expect(await claim.locator(".rs-gap__slot").evaluate((el) => getComputedStyle(el).display)).toBe(
      "none",
    )
    // 折的是重复，不是信息：理由与材料要求必须还在。
    await expect(claim.locator(".rs-gap__because")).toBeAttached()
    await expect(claim.locator(".rs-gap__require").first()).toBeAttached()
  })
})

/* -------------------------------------------------------------------------- */
/* 8 · 组装层：缺口分流                                                        */
/* -------------------------------------------------------------------------- */

test.describe("8 · 缺口通道", () => {
  /**
   * 这两条测试的**第一版是错的**，而且错得有价值，所以留在这里说明清楚。
   *
   * 第一版写的是「gaps 非空 ⇒ evidence 为空」。它失败了，失败得对：
   * `stale-source` 是一种**有内容**的缺口——那一栏有一条引用，
   * 只是那条引用已经无法核对。它当然会同时有 `gaps` 和 `evidence`。
   *
   * 所以真正的规则不是「有缺口就没有证据」，而是**按 kind 分开**：
   *
   *   unsupported-claim  → 那一栏真的空着         → 虚线空槽
   *   stale-source       → 那一栏有内容但不可核对   → 删除线 + 「引用不可核对」
   *   其余三种           → 有内容、也不缺可核对性   → 只在 rail 与论断标记里出现
   */
  test("unsupported-claim 画空槽——那一栏真的空着", () => {
    const unsupported = claims().filter(
      (projection) => projection.gaps[0]?.kind === "unsupported-claim",
    )
    expect(unsupported.length, "数据集里应有无证据支撑的论断").toBeGreaterThan(0)
    for (const projection of unsupported) {
      expect(
        projection.evidence,
        `${projection.claim.id} 被画成空槽，就必须真的没有证据链接`,
      ).toEqual([])
    }
  })

  test("stale-source 不画空槽——那一栏有内容，只是不可核对", () => {
    const stale = claims().filter((projection) => projection.gaps[0]?.kind === "stale-source")
    expect(stale.length, "数据集里应有引用已失效的论断").toBeGreaterThan(0)
    for (const projection of stale) {
      expect(
        projection.evidence.length,
        `${projection.claim.id} 的引用仍然存在，只是无法核对——把它画成空槽等于谎报「我什么都没引用」`,
      ).toBeGreaterThan(0)
      expect(projection.basisStatus).toBe("invalidated")
    }
  })

  test("有证据的论断只在它就是 stale-source 时才带空槽", () => {
    for (const projection of claims()) {
      if (projection.gaps.length === 0) continue
      const kind = projection.gaps[0]!.kind
      if (projection.evidence.length > 0) {
        expect(
          kind,
          `${projection.claim.id} 有证据，唯一的空槽理由只能是「引用失效」`,
        ).toBe("stale-source")
      } else {
        expect(kind).toBe("unsupported-claim")
      }
    }
  })

  test("需要哪类材料由 Claim.kind 决定，不是组件编的", () => {
    const unsupported = claims().find((c) => c.claim.id === UNSUPPORTED_CLAIM_ID)!
    expect(unsupported.claim.kind).toBe("prediction")
    expect(unsupported.gaps[0]!.requires.sourceType).toBe("primary")
    expect(unsupported.gaps[0]!.requires.recencyAfterYear).toBe(2024)

    // 断言型论断不该要求一手材料——那是预测型的规则被误用到它身上。
    const assertion = claims().find((c) => c.claim.kind === "assertion" && c.gaps.length > 0)
    if (assertion) {
      expect(assertion.gaps[0]!.requires.sourceType).toBeNull()
      expect(assertion.gaps[0]!.requires.recencyAfterYear).toBeNull()
    }
  })

  test("第一视觉主角是第一条**真的空着**的论断", () => {
    const firstWithGap = claims().find((c) => c.gaps.length > 0)!
    expect(chain.primaryGap?.claim.claim.id).toBe(firstWithGap.claim.id)
    expect(firstWithGap.evidence).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 9 · 组装层：与 domain 一致                                                   */
/* -------------------------------------------------------------------------- */

test.describe("9 · 组装层不重新算任何数", () => {
  test("证据的 passageText / locatorLabel 与数据集逐条一致", () => {
    for (const projection of claims()) {
      const direct = projectClaimEvidence(loadBearingResearch, projection.claim.id, RESEARCH_LABELS)
      expect(projection.evidence).toEqual(direct)
      for (const item of projection.evidence) {
        const passage = loadBearingResearch.passages.find((p) => p.id === item.passageId)!
        expect(item.passageText).toBe(passage.text)
      }
    }
  })

  test("stance 数量统计来自实际链接，不是第二次过滤", () => {
    for (const projection of claims()) {
      const total = Object.values(projection.evidenceCountByStance).reduce((a, b) => a + b, 0)
      expect(total).toBe(projection.evidence.length)
    }
  })

  test("可访问名对每一条证据都是完整的（含 stance 词）", () => {
    const items: ClaimEvidence[] = claims().flatMap((c) => c.evidence)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.accessibleName).toContain(item.presentation.label)
      expect(item.accessibleName).toContain(item.locatorLabel)
    }
  })
})


/* 10 · Kits 边界                                                              */
/* -------------------------------------------------------------------------- */

test.describe("10 · Kits 边界", () => {
  /**
   * 产品代码只能走适配层。`kits doctor` 的 `boundary` 检查是权威，
   * 但它是**外部工具**：把这条断言留在仓库里，意味着换一台机器、
   * 或不装 Kits 的情况下，这条约束仍然被守住。
   *
   * 适配层自己**必须**指向 installed/ —— 那是设计本身，所以它被排除。
   */
  test("产品源码没有直接 import lib/kits/installed", () => {
    const roots = ["app", "components", "lib/research", "lib/research-ui", "stores", "hooks", "scripts"]
    const offenders: string[] = []
    const walk = (dir: string) => {
      let entries: string[]
      try {
        entries = readdirSync(join(process.cwd(), dir))
      } catch {
        return
      }
      for (const entry of entries) {
        const rel = join(dir, entry)
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
        else if (/\.(ts|tsx|mjs|css)$/.test(entry)) {
          const code = readFileSync(join(process.cwd(), rel), "utf8")
          if (/from\s+"[^"]*kits\/installed/.test(code) || /@import\s+"[^"]*kits\/installed/.test(code)) {
            offenders.push(rel)
          }
        }
      }
    }
    for (const root of roots) walk(root)
    expect(offenders, "必须走 Product → lib/kits/adapters → installed").toEqual([])
  })

  test("产品源码不出现具体 Kits 资产 id（lib/kits/ 之外）", () => {
    // 与 factory-contract.spec.ts 同一条规则，但这里额外把
    // `lib/research-ui`（Phase D 新增的组装层）纳入扫描范围。
    const ASSET_IDS = [
      "cinematic",
      "editorial",
      "instrument",
      "animated-grid",
      "data-cursor",
      "insight-reveal",
      "interactive-hero",
      "spotlight-surface",
      "ambient-glow",
      "paper-grain",
      "scanline-sweep",
    ]
    const offenders: string[] = []
    const walk = (dir: string) => {
      let entries: string[]
      try {
        entries = readdirSync(join(process.cwd(), dir))
      } catch {
        return
      }
      for (const entry of entries) {
        const rel = join(dir, entry)
        if (rel.startsWith(join("lib", "kits"))) continue
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
        else if (/\.(ts|tsx|mjs)$/.test(entry)) {
          const code = readFileSync(join(process.cwd(), rel), "utf8")
          for (const id of ASSET_IDS) {
            if (code.includes(id)) offenders.push(`${rel} → "${id}"`)
          }
        }
      }
    }
    walk("lib/research-ui")
    walk("components")
    walk("app")
    expect(offenders).toEqual([])
  })
})


/* -------------------------------------------------------------------------- */
