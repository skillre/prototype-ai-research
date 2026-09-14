import { test, expect, type Page } from "@playwright/test"

import {
  loadBearingResearch,
  parseDispositionReason,
  formatDispositionReason,
  traceTimeline,
  type TraceKind,
} from "../lib/research"
import { groupTraceBySubject, projectTrace, projectTraceForSubject } from "../lib/research-ui"
import { TRACE_COPY } from "../lib/research-ui/copy"
import { messages } from "../lib/i18n"

/**
 * Phase G+H —— Trace（研究轨迹）。
 *
 * 这一屏与 activity feed 的区别是它的全部设计约束：
 *
 * ```
 * activity feed   你**做了什么**，按时间倒序
 * 研究轨迹         你**为什么这么判断**，按对象分组，每条都必须有理由
 * ```
 *
 * §17 要求每条回答五个问题：谁 / 什么时候 / 对什么 / 做了什么 / 为什么。
 * 本 spec 逐条查它们，其中「对什么」是最容易退化的一个——
 * 顺手显示一个 id 特别简单，而一个 id 什么也没回答。
 */

const ROUTE = "/r/res-load-bearing"
const t = messages.research.trace

const board = projectTrace(loadBearingResearch, TRACE_COPY)
const groups = groupTraceBySubject(loadBearingResearch, TRACE_COPY)

/** 夹具里出现的全部事件类型。§17 逐个点名要求展示。 */
const REQUIRED_KINDS: TraceKind[] = [
  "claim-created",
  "claim-retracted",
  "link-created",
  "link-retired",
  "tension-dispositioned",
  "ai-output-rejected",
  "ai-output-accepted",
]

async function gotoResearch(page: Page) {
  await page.goto(ROUTE)
  await expect(page.getByTestId("research-shell")).toBeVisible()
}

async function openTrace(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024
  if (mobile) {
    await page.getByTestId("tension-dock").locator(".rs-rail-dock__toggle").click()
    await page.waitForTimeout(250)
    await page.getByTestId("tension-dock").getByTestId("open-trace").click()
  } else {
    await page.locator(".rs-rail-desktop").getByTestId("open-trace").click()
  }
  await expect(page.getByTestId("trace-sheet")).toBeVisible()
}

/** 展开材料 / 原文。默认第一条已经展开——直接 click 会把它**收起**。 */
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
/* 1 · 投影：把 id 变成人话                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Trace · 投影", () => {
  test("时间线按时间倒序，最新的在最前", () => {
    const rows = board.rows
    expect(rows).toHaveLength(loadBearingResearch.trace.length)
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.at >= rows[i]!.at, `${rows[i - 1]!.id} 应当不早于 ${rows[i]!.id}`).toBe(true)
    }
    // 与领域层的排序是**同一个**结果，不是界面自己排的。
    expect(rows.map((row) => row.id)).toEqual(traceTimeline(loadBearingResearch).map((e) => e.id))
  })

  test("每一行都回答了五个问题，一个都不缺", () => {
    for (const row of board.rows) {
      expect(row.actorLabel.trim().length, `${row.id} 缺「谁」`).toBeGreaterThan(0)
      expect(row.dateLabel, `${row.id} 缺「什么时候」`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(row.subjectLabel.trim().length, `${row.id} 缺「对什么」`).toBeGreaterThan(0)
      expect(row.kindLabel.trim().length, `${row.id} 缺「做了什么」`).toBeGreaterThan(0)
      expect(row.reason.trim().length, `${row.id} 缺「为什么」`).toBeGreaterThan(0)
    }
  })

  test("「对什么」是人话，不是 id —— 而且能追到真实对象", () => {
    for (const row of board.rows) {
      expect(row.dangling, `${row.id} 的对象解析不出来`).toBe(false)
      /* 一个裸 id 会以 `clm-` / `lnk-` / `psg-` 开头。
         它必须已经被换成一个名字。 */
      expect(row.subjectLabel, `${row.id} 直接在界面上显示了 id`).not.toMatch(
        /^(clm|lnk|psg|src|ai|trace)-/,
      )
    }

    // 抽样确认它真的是那条对象的名字，不是随便一句话。
    const claimRow = board.rows.find((row) => row.subjectType === "claim")!
    const claimId = claimRow.subjectId
    const claim = loadBearingResearch.claims.find((c) => c.id === claimId)!
    expect(claimRow.subjectLabel).toContain("论断")
    expect(claimRow.subjectLabel).toContain(claim.text.slice(0, 12))
  })

  test("引用类事件显示**两端**，且关系词是人话不是 domain 的标识", () => {
    const linkRows = board.rows.filter((row) => row.subjectType === "evidence-link")
    expect(linkRows.length, "夹具里必须有引用事件").toBeGreaterThan(0)
    for (const row of linkRows) {
      // 两端：来源名 → 论断 N
      expect(row.subjectLabel).toContain("→")
      expect(row.subjectLabel).toMatch(/论断 \d+/)
      expect(row.subjectLabel).toContain("引用")
      /**
       * ⚠ 这两条断言是**看截图**补上的，不是设计时想到的。
       *
       * 第一版这里显示的是 `supports引用`——直接把 `link.stance` 拼进了文案。
       * 本地化审计**抓不到它**：那串文字含中文，于是被判为「已本地化」。
       * 所以必须显式断言它不含四个 stance 的英文标识，且含契约里的中文词。
       */
      for (const stance of ["supports", "contradicts", "qualifies", "context"]) {
        expect(row.subjectLabel, `${row.id} 泄漏了英文 stance 标识「${stance}」`).not.toContain(stance)
      }
      expect(row.subjectLabel).toMatch(/反驳|支持|限定|背景/)
    }
  })

  test("处置的两个出口在轨迹里仍然是**两个词**", () => {
    const rows = projectTraceForSubject(
      loadBearingResearch,
      "tension",
      "single-source::clm-utilization-recovery",
      TRACE_COPY,
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.resolution).toBe("accepted-as-limitation")
    expect(row.resolutionLabel).toBe(t.resolution["accepted-as-limitation"])
    // 理由里不再有技术前缀——它被拆出来了。
    expect(row.reason).not.toContain("accepted-as-limitation")
    expect(row.reason).toContain("这份报告的口径")
  })

  test("formatDispositionReason 与 parseDispositionReason 互为逆运算", () => {
    for (const resolution of ["resolved", "accepted-as-limitation"] as const) {
      const text = "理由里有：冒号，也有 accepted-as-limitation 这个词。"
      const parsed = parseDispositionReason(formatDispositionReason(resolution, text))
      expect(parsed.resolution).toBe(resolution)
      expect(parsed.text).toBe(text)
    }
    // 认不出来时不猜——手写的轨迹条目必须原样保留。
    const handwritten = parseDispositionReason("当时就是这么记的。")
    expect(handwritten.resolution).toBeNull()
    expect(handwritten.text).toBe("当时就是这么记的。")
  })

  test("按对象分组：每个组都能回答「这个对象被改过几次」", () => {
    const total = groups.reduce((sum, group) => sum + group.count, 0)
    expect(total).toBe(board.rows.length)
    expect(groups[0]!.latestAt >= groups[groups.length - 1]!.latestAt).toBe(true)

    const retracted = loadBearingResearch.claims.find((claim) => claim.status === "retracted")!
    const group = groups.find((g) => g.id === retracted.id)
    expect(group, "被撤回的论断必须有历史").toBeDefined()
    expect(group!.count).toBeGreaterThanOrEqual(2) // claim-created + claim-retracted
  })
})

/* -------------------------------------------------------------------------- */
/* 2 · §18 的四个问题，逐个回答                                                   */
/* -------------------------------------------------------------------------- */

test.describe("Trace · 答案可查", () => {
  test("「这条论断为什么后来被停用？」——有事件，也有理由", () => {
    const rows = projectTraceForSubject(
      loadBearingResearch,
      "evidence-link",
      "lnk-media-expansion",
      TRACE_COPY,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kindLabel).toBe(t.kind["link-retired"])
    expect(rows[0]!.reason).toContain("单一信源")
    expect(rows[0]!.factChanging).toBe(true)
  })

  test("「这个局限什么时候被接受的？」——时间、理由、出口三样都在", () => {
    const rows = projectTraceForSubject(
      loadBearingResearch,
      "tension",
      "single-source::clm-utilization-recovery",
      TRACE_COPY,
    )
    expect(rows[0]!.dateLabel).toBe("2026-09-09")
    expect(rows[0]!.actorLabel).toBe(t.actor.human)
    expect(rows[0]!.reason.length).toBeGreaterThan(10)
  })

  test("「这条 AI 意见为什么被驳回？」——点名了是哪一条输出", () => {
    const rows = projectTraceForSubject(
      loadBearingResearch,
      "ai-output",
      "ai-suggestion-expand-scope",
      TRACE_COPY,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kindLabel).toBe(t.kind["ai-output-rejected"])
    // 它必须说清是哪一条建议，而不是「一条 AI 输出」。
    expect(rows[0]!.subjectLabel).toContain("C 路线")
    expect(rows[0]!.reason).toContain("研究范围外")
  })

  test("「这条引用什么时候加进去的？」——由收到结论的那条论断侧可查", () => {
    const rows = projectTraceForSubject(
      loadBearingResearch,
      "claim",
      "clm-expansion-announced",
      TRACE_COPY,
    )
    const kinds = rows.map((row) => row.kind)
    expect(kinds).toContain("claim-created")
    expect(kinds).toContain("claim-retracted")
  })

  test("不变量：每条轨迹的对象都能解析到（夹具里没有一个 dangling）", () => {
    expect(board.rows.filter((row) => row.dangling)).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 3 · 界面                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Trace · 抽屉", () => {
  test("打开、按对象分组、展开看记录", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openTrace(page)

    await expect(page.getByTestId("trace-drawer")).toBeVisible()
    await expect(page.locator(".rs-trace__group")).toHaveCount(groups.length)
    // 默认展开最近被改动的那个对象——打开就看得见内容。
    await expect(page.locator('.rs-trace__group[data-open="true"]')).toHaveCount(1)
    expect(await page.locator(".rs-trace__row").count()).toBeGreaterThan(0)
  })

  test("每一行显示五要素，且理由留在 body 里", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openTrace(page)

    const row = page.locator(".rs-trace__row").first()
    await expect(row.locator(".rs-trace__facts")).toBeVisible()
    await expect(row.locator(".rs-trace__reason")).toBeVisible()
    const labels = await row.locator(".rs-trace__facts dt").evaluateAll((els) =>
      els.map((el) => el.textContent ?? ""),
    )
    expect(labels).toEqual([t.atLabel, t.actorLabel, t.kindLabel, t.subjectLabel])
  })

  test("事件类型是人话，不是 domain 的英文 code", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openTrace(page)

    const kinds = await page
      .locator(".rs-trace__row")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-trace-kind") ?? ""))
    expect(kinds.length).toBeGreaterThan(0)
    for (const kind of kinds) {
      expect(REQUIRED_KINDS, `${kind} 不在已知事件类型里`).toContain(kind)
    }

    const visible = await page.locator(".rs-trace__row").first().innerText()
    expect(visible).not.toMatch(/claim-created|link-retired|tension-dispositioned/)
    expect(visible).toContain("2026-")
  })

  test("它没有输入框、没有确认按钮——轨迹是只读的历史", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openTrace(page)

    const sheet = page.getByTestId("trace-sheet")
    expect(await sheet.locator("input, textarea, [contenteditable]").count()).toBe(0)
  })

  test("Escape 关闭并把焦点还给入口", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    const trigger = page.locator(".rs-rail-desktop").getByTestId("open-trace")
    await trigger.click()
    await expect(page.getByTestId("trace-sheet")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("trace-sheet")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("轨迹与材料**互斥**：同时只开一个抽屉", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)
    await openTrace(page)
    // 材料入口此刻在轨迹抽屉的遮罩下面，点不到——这正是互斥的表现。
    await expect(page.getByTestId("source-sheet")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await page.locator(".rs-rail-desktop").getByTestId("open-source-index").click()
    await expect(page.getByTestId("source-sheet")).toBeVisible()
    await expect(page.getByTestId("trace-sheet")).toHaveCount(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 4 · 轨迹是活的                                                                */
/* -------------------------------------------------------------------------- */

test.describe("Trace · 写入之后立刻可见", () => {
  test("补一条引用之后，轨迹里多一条「加入引用」，且入口计数跟着涨", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoResearch(page)

    const entry = page.locator(".rs-rail-desktop").getByTestId("open-trace")
    await expect(entry).toContainText(String(loadBearingResearch.trace.length))

    await page.locator(".rs-rail-desktop").getByTestId("open-source-index").click()
    await ensureSourceOpen(page, "src-paid-summary")
    await ensurePassageOpen(page, "psg-summary-cost")
    await page.getByTestId("compose-psg-summary-cost").click()
    await page.locator(".rs-link__select").selectOption("clm-cost-inflection")
    await page.locator('.rs-link__stance[data-stance="supports"] input').check()
    await page.getByTestId("link-submit").click()
    await expect(page.getByTestId("link-accepted")).toBeVisible()
    await page.getByTestId("source-sheet-close").click()

    await expect(entry).toContainText(String(loadBearingResearch.trace.length + 1))

    await entry.click()
    await expect(page.getByTestId("trace-sheet")).toBeVisible()
    await expect(
      page.locator('.rs-trace__row[data-trace-kind="link-created"]'),
      "新写的引用必须立刻出现在轨迹里",
    ).toHaveCount(1)
  })
})
