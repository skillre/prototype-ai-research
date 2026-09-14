import { test, expect, type Page } from "@playwright/test"
import { LOCALIZED_ROUTES, expectFullyLocalized } from "./support/localization"

/**
 * 本地化完整性（Phase 3 — English Leakage Audit）。
 *
 * 覆盖当前**真实存在**的页面：落地页（/）与 Factory 的内置演示（/demo）。
 *
 * 判定规则集中在 `tests/support/localization.ts`，这里只负责"把页面打开、
 * 把浮层展开、然后断言"。
 *
 * 数据里的专有名词（公司名、人名、邮箱、URL、技术栈名称、快捷键）由
 * 允许列表统一放行——它们是内容或技术标识，不是界面文案。
 *
 * > 产品界面出现后，把真实存在的路由加进 `LOCALIZED_ROUTES` 即可。
 * > 不要预先登记尚未实现的路由：那会让这个 spec 在页面上线前就假绿。
 */

async function waitReady(page: Page, route: string) {
  if (route === "/demo") {
    await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })
  }
}

test.describe("界面文案零英文泄漏", () => {
  test("html 声明 zh-CN", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
  })

  for (const route of LOCALIZED_ROUTES) {
    test(`${route} 渲染后没有未翻译的界面文案`, async ({ page }) => {
      await page.goto(route)
      await waitReady(page, route)
      await expectFullyLocalized(page, route)
    })
  }
})

test.describe("浮层与表单同样完成本地化", () => {
  test("演示：命令面板 / 引导向导 / 添加客户 / 详情抽屉", async ({ page }) => {
    await page.goto("/demo")
    await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })

    await page.keyboard.press("ControlOrMeta+K")
    await expect(page.getByTestId("command-palette")).toBeVisible()
    await expectFullyLocalized(page, "演示命令面板")
    await page.keyboard.press("Escape")

    await page.getByTestId("nav-settings").click()
    await expect(page.getByTestId("onboarding-wizard")).toBeVisible()
    await expectFullyLocalized(page, "演示引导向导")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("onboarding-wizard")).not.toBeVisible()

    await page.getByTestId("nav-customers").click()
    await page.getByTestId("add-customer").click()
    const dialog = page.getByTestId("add-customer-dialog")
    await expect(dialog).toBeVisible()
    await expectFullyLocalized(page, "演示添加客户")
    await dialog.getByRole("button", { name: "关闭", exact: true }).first().click()
    await expect(dialog).not.toBeVisible()

    await page.getByTestId("customers-table").locator("tbody tr").first().click()
    await expect(page.getByTestId("customer-drawer")).toBeVisible()
    await expectFullyLocalized(page, "演示详情抽屉")
  })
})

test.describe("研究工作的浮层同样完成本地化", () => {
  /**
   * 这一组是 Phase G+H 补上的。
   *
   * `LOCALIZED_ROUTES` 只检查**页面打开时**可见的文案，而材料抽屉、轨迹抽屉、
   * 关联表单全部在浮层里——它们恰好是最容易泄漏英文的地方：
   *
   * ```
   * 来源性质标签      PDF / primary / secondary
   * 定位文本          第 12 页 / 锚点 cost-curve
   * 轨迹事件类型      claim-created / tension-dispositioned
   * 关系词            从契约里取的那四个
   * ```
   *
   * 前两样有合法的英文（PDF 是技术名词，锚点里带着数据自己的 id），
   * 所以这一组真正查的是第三样：**事件类型必须被翻成人话**。
   */
  test("材料抽屉与关联表单", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/r/res-load-bearing")
    await expect(page.getByTestId("research-shell")).toBeVisible()

    await page.locator(".rs-rail-desktop").getByTestId("open-source-index").click()
    await expect(page.getByTestId("source-sheet")).toBeVisible()
    await expectFullyLocalized(page, "材料抽屉")

    // 展开一段原文，并打开关联表单——表单里的关系词是最容易漏的一处。
    await page.locator(".rs-psg__head").first().click()
    await page.locator('[data-testid^="compose-"]').first().click()
    await expect(page.locator(".rs-link")).toBeVisible()
    await expectFullyLocalized(page, "关联表单")

    // 建立一条引用之后的收尾块。
    await page.locator(".rs-link__select").selectOption("clm-cost-inflection")
    await page.locator('.rs-link__stance[data-stance="supports"] input').check()
    await page.getByTestId("link-submit").click()
    await expect(page.getByTestId("closed-tensions")).toBeVisible()
    await expectFullyLocalized(page, "收尾块")
  })

  test("轨迹抽屉：事件类型必须是人话", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/r/res-load-bearing")
    await page.locator(".rs-rail-desktop").getByTestId("open-trace").click()
    await expect(page.getByTestId("trace-sheet")).toBeVisible()
    await expectFullyLocalized(page, "轨迹抽屉")

    // 显式再查一次：事件类型绝不能以 domain 的 code 出现。
    const text = await page.getByTestId("trace-sheet").innerText()
    expect(text).not.toMatch(/claim-created|claim-retracted|link-created|link-retired/)
    expect(text).not.toMatch(/tension-dispositioned|ai-output-(rejected|accepted)/)
  })
})

test.describe("关键控件文案", () => {
  test("演示的侧栏身份、排序与筛选控件为中文", async ({ page }) => {
    await page.goto("/demo")
    await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId("nav-overview")).toContainText("总览")
    await expect(page.getByTestId("demo-root")).toContainText("云图分析")
    await expect(page.getByTestId("demo-root")).toContainText("吴桐")

    await page.getByTestId("nav-customers").click()
    // 排序触发器必须显示中文标签，而不是内部的 sortKey。
    await expect(page.getByTestId("filter-sort")).toContainText("排序：最近活跃")
    await expect(page.getByTestId("filter-status")).toContainText("全部状态")
    await expect(page.getByTestId("filter-plan")).toContainText("全部套餐")
  })

  test("新增记录使用中文时间字段", async ({ page }) => {
    await page.goto("/demo")
    await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })

    await page.getByTestId("nav-customers").click()
    await page.getByTestId("add-customer").click()
    await page.getByTestId("add-customer-name").fill("天穹智能")
    await page.getByTestId("add-customer-dialog").getByPlaceholder("张启明").fill("周立")
    await page
      .getByTestId("add-customer-dialog")
      .getByPlaceholder("zhangqiming@hanzhou-data.cn")
      .fill("zhouli@tianqiong.cn")
    await page.getByTestId("add-customer-submit").click()

    const row = page.getByTestId("customers-table").locator("tbody tr", { hasText: "天穹智能" })
    await expect(row).toContainText("刚刚")
    await expect(row).not.toContainText("Just now")
  })
})

test.describe("主题 token", () => {
  test("Light 与 Dark 都提供完整的语义 token 且取值不同", async ({ page }) => {
    await page.goto("/demo")
    await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })

    const readTokens = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        const names = [
          "--background",
          "--surface",
          "--elevated",
          "--interactive",
          "--foreground",
          "--muted",
          "--border",
          "--accent",
          "--accent-soft",
          "--success",
          "--warning",
          "--danger",
          "--info",
          "--brand",
          "--elevation-subtle",
          "--elevation-card",
          "--elevation-elevated",
          "--elevation-floating",
          "--duration-press",
          "--duration-enter",
          "--duration-drawer",
          "--motion-ease-spring",
          "--radius",
        ]
        return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]))
      })

    const light = await readTokens()
    for (const [name, value] of Object.entries(light)) {
      expect(value, `${name} must be defined in the light theme`).not.toBe("")
    }

    await page.getByTestId("toggle-theme").click()
    await expect(page.locator("html")).toHaveClass(/dark/)

    const dark = await readTokens()
    for (const [name, value] of Object.entries(dark)) {
      expect(value, `${name} must be defined in the dark theme`).not.toBe("")
    }

    // Light 与 Dark 必须真的不同，否则暗色主题等于没生效。
    expect(dark["--background"]).not.toBe(light["--background"])
    expect(dark["--surface"]).not.toBe(light["--surface"])
    expect(dark["--elevation-card"]).not.toBe(light["--elevation-card"])
  })
})
