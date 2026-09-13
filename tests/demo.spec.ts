import { test, expect } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/demo")
  // 等待模拟的初始加载（骨架屏 → 就绪）。
  await expect(page.getByTestId("demo-content")).toBeVisible({ timeout: 20_000 })
})

test("opens the demo dashboard", async ({ page }) => {
  await expect(page.getByTestId("demo-root")).toBeVisible()
  await expect(page.getByText("月经常性收入").first()).toBeVisible()
  await expect(page.getByText("本周聚焦")).toBeVisible()
})

test("dialog opens and closes", async ({ page }) => {
  await page.getByTestId("nav-customers").click()
  await page.getByTestId("add-customer").click()

  const dialog = page.getByTestId("add-customer-dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("添加客户").first()).toBeVisible()

  await page.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(dialog).not.toBeVisible()
})

test("drawer opens and closes", async ({ page }) => {
  await page.getByTestId("nav-customers").click()

  const table = page.getByTestId("customers-table")
  await expect(table).toBeVisible()
  await table.locator("tbody tr").first().click()

  const drawer = page.getByTestId("customer-drawer")
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText("账户备注")).toBeVisible()

  await drawer.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(drawer).not.toBeVisible()
})

test("tabs switch between All and Unread", async ({ page }) => {
  await page.getByTestId("nav-activity").click()

  const allTab = page.getByTestId("tab-activity-all")
  const unreadTab = page.getByTestId("tab-activity-unread")
  await expect(allTab).toBeVisible()

  // 初始为「全部」→ 完整历史可见。
  await expect(page.getByText("每周报告已生成")).toBeVisible()

  // 全部标为已读，切到「未读」→ 出现空状态。
  await page.getByTestId("mark-all-read").click()
  await unreadTab.click()
  await expect(page.getByText("没有未读通知")).toBeVisible()

  // 切回「全部」→ 历史恢复。
  await allTab.click()
  await expect(page.getByText("每周报告已生成")).toBeVisible()
})

test("filter changes the table results", async ({ page }) => {
  await page.getByTestId("nav-customers").click()

  const search = page.getByTestId("customer-search")
  const rows = page.getByTestId("customers-table").locator("tbody tr")
  await expect(rows).toHaveCount(14)

  await search.fill("望江纺织")
  await expect(rows).toHaveCount(1)
  await expect(page.getByTestId("customers-table")).toContainText("望江纺织")

  await search.fill("不存在的公司")
  await expect(page.getByText("没有符合条件的客户")).toBeVisible()

  await page.getByRole("button", { name: "清除筛选" }).click()
  await expect(rows).toHaveCount(14)
})