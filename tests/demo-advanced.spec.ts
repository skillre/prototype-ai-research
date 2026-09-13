import { test, expect } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/demo")
  // 等待模拟的初始加载（骨架屏 → 就绪）。
  await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })
})

test("command palette opens with ⌘K/Ctrl+K and navigates", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+K")

  const palette = page.getByTestId("command-palette")
  await expect(palette).toBeVisible()
  await expect(palette.getByPlaceholder("输入命令或搜索…")).toBeVisible()

  // 选择「前往动态」——真实执行导航并关闭面板。
  await page.getByRole("option", { name: "前往动态" }).click()
  await expect(palette).not.toBeVisible()
  await expect(page.getByTestId("activity-tabs-list")).toBeVisible()
})

test("adds a customer and sees it in the table and drawer", async ({ page }) => {
  await page.getByTestId("nav-customers").click()

  const table = page.getByTestId("customers-table")
  await expect(table.locator("tbody tr")).toHaveCount(14)

  await page.getByTestId("add-customer").click()
  const dialog = page.getByTestId("add-customer-dialog")
  await expect(dialog).toBeVisible()

  await page.getByTestId("add-customer-name").fill("天穹智能")
  await dialog.getByPlaceholder("张启明").fill("周立")
  await dialog.getByPlaceholder("zhangqiming@hanzhou-data.cn").fill("zhouli@tianqiong.cn")
  await page.getByTestId("add-customer-submit").click()

  await expect(dialog).not.toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(15)
  await expect(table).toContainText("天穹智能")

  // 新客户实时出现在表格中，打开其详情抽屉核对内容。
  await table.locator("tbody tr", { hasText: "天穹智能" }).click()
  const drawer = page.getByTestId("customer-drawer")
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText("账户备注")).toBeVisible()
  await expect(drawer.getByText("周立", { exact: true })).toBeVisible()
  await expect(drawer.getByRole("button", { name: "关停账户" })).toBeVisible()

  await drawer.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(drawer).not.toBeVisible()
})

test("detail drawer shows record data and footer actions", async ({ page }) => {
  await page.getByTestId("nav-customers").click()

  const table = page.getByTestId("customers-table")
  await expect(table).toBeVisible()
  await table.locator("tbody tr").first().click()

  const drawer = page.getByTestId("customer-drawer")
  await expect(drawer).toBeVisible()

  // 默认按「最近活跃」升序，第一行是「星槎出行」。
  await expect(drawer.getByText("星槎出行", { exact: true })).toBeVisible()
  await expect(drawer.getByText("郑一诺", { exact: true })).toBeVisible()
  await expect(drawer.getByText("账户备注")).toBeVisible()
  await expect(drawer.getByRole("button", { name: "复制邮箱" })).toBeVisible()
  await expect(drawer.getByRole("button", { name: "关停账户" })).toBeVisible()

  await drawer.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(drawer).not.toBeVisible()
})

test("drag and drop reorders focus priorities", async ({ page }) => {
  const items = page.locator('li[aria-roledescription="sortable"]')
  await expect(items).toHaveCount(5)

  const source = items.filter({ hasText: "上线 2.0 版引导流程" })
  const target = items.filter({ hasText: "安排 5 场用户访谈" })
  await target.scrollIntoViewIfNeeded()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error("priority items are not rendered")

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 15 }
  )
  await page.mouse.up()

  // p1 被拖到 p5 的位置 → p2 升为第一项，顺序保存在本地状态。
  await expect(items.first()).toContainText("复盘第四季度增购管线")
  await expect(items.last()).toContainText("上线 2.0 版引导流程")
})

test.describe("mobile viewport (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("renders the mobile shell and navigates via the drawer", async ({ page }) => {
    // 移动端：桌面侧栏隐藏，移动顶栏 + 汉堡菜单可用。
    await expect(page.getByTestId("mobile-nav")).toBeVisible()
    await expect(page.locator("aside")).toBeHidden()
    await expect(page.getByTestId("demo-content")).toBeVisible()

    await page.getByTestId("mobile-nav").click()
    const navDrawer = page.getByRole("dialog")
    await expect(navDrawer.getByTestId("nav-customers")).toBeVisible()
    await navDrawer.getByTestId("nav-customers").click()

    // 客户页在移动端可用：表格、筛选与添加入口都在。
    await expect(page.getByTestId("customers-table")).toBeVisible()
    await expect(page.getByTestId("customer-search")).toBeVisible()
    await expect(page.getByTestId("add-customer")).toBeVisible()
  })
})