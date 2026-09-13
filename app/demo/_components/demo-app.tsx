"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { toast } from "sonner"
import {
  ActivityIcon,
  BellIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  PlusIcon,
  RotateCwIcon,
  SettingsIcon,
  SunMoonIcon,
  UserPlusIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react"
import {
  Sidebar,
  type NavBrandDef,
  type NavId,
  type NavItemDef,
  type NavUsageDef,
  type NavUserDef,
} from "@/components/layout/sidebar"
import { TopNav, type TopNavDataSource } from "@/components/layout/top-nav"
import { MobileNav } from "@/components/layout/mobile-nav"
import { PageContainer } from "@/components/layout/page-container"
import { PageTransition } from "@/components/motion/page-transition"
import { LoadingState } from "@/components/prototype/loading-state"
import { ErrorState } from "@/components/prototype/error-state"
import { CommandPalette, type PaletteGroup } from "@/components/prototype/command-palette"
import { OnboardingWizard } from "@/components/prototype/onboarding-wizard"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { useHotkey } from "@/hooks/use-hotkey"
import { useMessages } from "@/components/i18n/locale-provider"
import type { Messages } from "@/lib/i18n"
import { useDashboardStore } from "@/stores/dashboard-store"
import { OverviewSection } from "./overview-section"
import { CustomersSection } from "./customers-section"
import { ActivitySection } from "./activity-section"

/** 演示自己的三个页签——`NavId` 是开放的 string，这里收紧成真实取值。 */
type DemoTab = keyof Messages["demo"]["pages"]

/**
 * 演示自己的通知分类图标。
 *
 * 这张表曾经住在 `components/layout/top-nav.tsx` 里（`KIND_ICON`），于是
 * payment / trial / usage / report 这套产品词汇成了共享 Core 的一部分，
 * 还逼着 `lib/crm-data.ts` 去镜像同一个 union。它现在是 /demo 自己的决定。
 */
const NOTIFICATION_ICONS: Record<string, typeof BellIcon> = {
  payment: CreditCardIcon,
  trial: UserPlusIcon,
  usage: ZapIcon,
  report: BellIcon,
}

export function DemoApp() {
  const t = useMessages()
  const copy = t.demo
  const [activeTab, setActiveTab] = useState<DemoTab>("overview")
  const [commandOpen, setCommandOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  const status = useDashboardStore((s) => s.status)
  const errorMessage = useDashboardStore((s) => s.errorMessage)
  const notifications = useDashboardStore((s) => s.notifications)
  const initialize = useDashboardStore((s) => s.initialize)
  const refresh = useDashboardStore((s) => s.refresh)
  const resetDemo = useDashboardStore((s) => s.resetDemo)
  const simulateApiFailure = useDashboardStore((s) => s.simulateApiFailure)
  const markAllNotificationsRead = useDashboardStore((s) => s.markAllNotificationsRead)

  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    initialize()
  }, [initialize])

  useHotkey(
    "k",
    () => setCommandOpen(true),
    { mod: true }
  )

  const navigate = (id: NavId) => {
    if (id === "settings") {
      setWizardOpen(true)
      return
    }
    setActiveTab(id as DemoTab)
  }

  // 未读徽标由调用方派生（SidebarNav 本身不再读取 store，以便被其他原型复用）。
  //
  // Factory v1.1：这台演示现在**自己声明**导航项与品牌身份，而不是继承
  // `components/layout/sidebar.tsx` 的内置默认值。共享组件对产品身份零意见——
  // 这正是新建原型不会莫名继承「云图分析 / 吴桐」的原因。
  const navItems: NavItemDef[] = useMemo(
    () =>
      [
        { id: "overview", label: copy.nav.overview, icon: LayoutDashboardIcon },
        { id: "customers", label: copy.nav.customers, icon: UsersIcon },
        { id: "activity", label: copy.nav.activity, icon: ActivityIcon },
        { id: "settings", label: copy.nav.settings, icon: SettingsIcon },
      ].map((item) =>
        item.id === "activity"
          ? { ...item, badge: notifications.filter((n) => n.unread).length }
          : item
      ),
    [notifications, copy.nav]
  )

  const meta = copy.pages[activeTab]

  /** 向导里存的是角色键，确认页要展示中文标签——键永远不进 UI。 */
  const roleLabel = (role: string) =>
    role === "designer"
      ? copy.wizard.role.designer
      : role === "engineer"
        ? copy.wizard.role.engineer
        : role === "founder"
          ? copy.wizard.role.founder
          : t.common.notAvailable

  const paletteGroups = useMemo<PaletteGroup[]>(
    () => [
      {
        heading: copy.palette.navigate,
        items: [
          {
            id: "nav-overview",
            label: copy.palette.overview,
            icon: LayoutDashboardIcon,
            keywords: copy.palette.keywords.overview,
            onSelect: () => setActiveTab("overview"),
          },
          {
            id: "nav-customers",
            label: copy.palette.customers,
            icon: UsersIcon,
            keywords: copy.palette.keywords.customers,
            onSelect: () => setActiveTab("customers"),
          },
          {
            id: "nav-activity",
            label: copy.palette.activity,
            icon: ActivityIcon,
            keywords: copy.palette.keywords.activity,
            onSelect: () => setActiveTab("activity"),
          },
        ],
      },
      {
        heading: copy.palette.actions,
        items: [
          {
            id: "add-customer",
            label: copy.palette.addCustomer,
            icon: PlusIcon,
            keywords: copy.palette.keywords.addCustomer,
            onSelect: () => {
              setActiveTab("customers")
              setAddCustomerOpen(true)
            },
          },
          {
            id: "refresh",
            label: copy.palette.refresh,
            icon: RotateCwIcon,
            keywords: copy.palette.keywords.refresh,
            onSelect: refresh,
          },
          {
            id: "wizard",
            label: copy.palette.wizard,
            icon: LightbulbIcon,
            keywords: copy.palette.keywords.wizard,
            onSelect: () => setWizardOpen(true),
          },
          {
            id: "theme",
            label: copy.palette.theme,
            icon: SunMoonIcon,
            keywords: copy.palette.keywords.theme,
            shortcut: "⌘K →",
            onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
          },
          {
            id: "reset",
            label: copy.palette.reset,
            icon: RotateCwIcon,
            keywords: copy.palette.keywords.reset,
            onSelect: () => {
              resetDemo()
              toast.success(copy.toast.reset)
            },
          },
        ],
      },
    ],
    [copy, resolvedTheme, resetDemo, refresh, setTheme]
  )

  /* ------------------------------------------------------------------------
   * 产品身份与顶栏数据源——全部在这里显式注入。
   *
   * Factory v1.1 之前，这些值要么由 `components/layout/sidebar.tsx` 内置默认，
   * 要么由 TopNav 回落到 `useDashboardStore`；结果是共享 Core 组件硬依赖了这个
   * 演示的 store，而账户身份（姓名/邮箱/头像字）甚至是从词典默认带出来的。
   * 现在 /demo 与 AI CRM 走同一条路：调用方把身份和数据交进去。
   * ---------------------------------------------------------------------- */
  const brand: NavBrandDef = useMemo(
    () => ({ name: copy.brandName, subtitle: copy.brandSubtitle }),
    [copy]
  )

  const account: NavUserDef = useMemo(
    () => ({ name: copy.userName, email: copy.userEmail, initials: copy.userInitials }),
    [copy]
  )

  const usage: NavUsageDef = useMemo(
    () => ({ label: copy.usageLabel, value: copy.usageValue, progress: 64, hint: copy.usageHint }),
    [copy]
  )

  const topNavDataSource: TopNavDataSource = useMemo(
    () => ({
      notifications,
      status,
      onRefresh: refresh,
      onSimulateFailure: simulateApiFailure,
      onReset: resetDemo,
      onMarkAllRead: markAllNotificationsRead,
      notificationIcon: (notification) => NOTIFICATION_ICONS[notification.kind ?? ""] ?? BellIcon,
      // 演示里通知没有详情页；点击回到「动态」页签——这个决定属于 /demo，不属于 TopNav。
      onNotificationSelect: () => setActiveTab("activity"),
      primaryNavId: "settings",
      primaryNavLabel: copy.quickStart,
      account,
    }),
    [
      notifications,
      status,
      refresh,
      simulateApiFailure,
      resetDemo,
      markAllNotificationsRead,
      copy.quickStart,
      account,
    ]
  )

  return (
    <div data-testid="demo-root" className="flex min-h-dvh">
      <Sidebar
        active={activeTab}
        onNavigate={navigate}
        items={navItems}
        brand={brand}
        user={account}
        usage={usage}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden lg:block">
          <TopNav
            title={meta.title}
            subtitle={meta.subtitle}
            onOpenCommand={() => setCommandOpen(true)}
            onNavigate={navigate}
            dataSource={topNavDataSource}
          />
        </div>
        <div className="lg:hidden">
          <MobileNav
            title={meta.title}
            active={activeTab}
            onNavigate={navigate}
            onOpenCommand={() => setCommandOpen(true)}
            items={navItems}
            brand={brand}
            user={account}
            usage={usage}
          />
        </div>

        <main className="flex-1">
          <PageContainer
            title={meta.title}
            description={meta.subtitle}
            actions={
              <span className="hidden items-center gap-2 text-label text-muted-foreground lg:flex">
                <kbd className="kbd-chip">⌘K</kbd>
                {copy.commandHint}
              </span>
            }
          >
            {status === "error" ? (
              <div data-testid="error-state">
                <ErrorState
                  description={errorMessage ?? undefined}
                  onRetry={refresh}
                />
              </div>
            ) : status === "loading" ? (
              <div data-testid="loading-state" className="flex flex-col gap-6">
                <LoadingState variant="cards" count={4} />
                <LoadingState variant="section" />
                <LoadingState variant="rows" count={3} />
              </div>
            ) : (
              <div data-testid="demo-content">
                <PageTransition transitionKey={activeTab}>
                  {activeTab === "overview" ? <OverviewSection /> : null}
                  {activeTab === "customers" ? (
                    <CustomersSection
                      addOpen={addCustomerOpen}
                      onAddOpenChange={setAddCustomerOpen}
                    />
                  ) : null}
                  {activeTab === "activity" ? <ActivitySection /> : null}
                </PageTransition>
              </div>
            )}
          </PageContainer>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        groups={paletteGroups}
        testId="command-palette"
      />

      <OnboardingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        testId="onboarding-wizard"
        steps={[
          {
            id: "welcome",
            title: copy.wizard.welcome.title,
            description: copy.wizard.welcome.description(copy.workspace),
            render: ({ data, setData }) => (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-body-sm">
                  <Checkbox
                    checked={(data.haveTeam as boolean) ?? false}
                    onCheckedChange={(checked) => setData("haveTeam", checked === true)}
                  />
                  {copy.wizard.welcome.team}
                </label>
                <label className="flex items-center gap-2 text-body-sm">
                  <Checkbox
                    checked={(data.personal as boolean) ?? false}
                    onCheckedChange={(checked) => setData("personal", checked === true)}
                  />
                  {copy.wizard.welcome.personal}
                </label>
              </div>
            ),
          },
          {
            id: "role",
            title: copy.wizard.role.title,
            description: copy.wizard.role.description,
            render: ({ data, setData }) => (
              <RadioGroup
                value={String(data.role ?? "")}
                onValueChange={(next) => setData("role", next)}
              >
                <label className="flex cursor-pointer items-center gap-2 rounded-field border px-3 py-2 transition-colors duration-hover hover:bg-brand-soft/50">
                  <RadioGroupItem value="designer" id="role-designer" />
                  <span className="text-body-sm">{copy.wizard.role.designer}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-field border px-3 py-2 transition-colors duration-hover hover:bg-brand-soft/50">
                  <RadioGroupItem value="engineer" id="role-engineer" />
                  <span className="text-body-sm">{copy.wizard.role.engineer}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-field border px-3 py-2 transition-colors duration-hover hover:bg-brand-soft/50">
                  <RadioGroupItem value="founder" id="role-founder" />
                  <span className="text-body-sm">{copy.wizard.role.founder}</span>
                </label>
              </RadioGroup>
            ),
            validate: (data) => (data.role ? null : copy.wizard.role.required),
          },
          {
            id: "confirm",
            title: copy.wizard.confirm.title,
            description: copy.wizard.confirm.description,
            render: ({ data }) => (
              <ul className="flex flex-col gap-1.5 text-body-sm text-muted-foreground">
                <li>
                  {copy.wizard.confirm.workspace}
                  <span className="font-medium text-foreground">{copy.workspace}</span>
                </li>
                <li>
                  {copy.wizard.confirm.team}
                  <span className="font-medium text-foreground">
                    {data.haveTeam === true ? copy.wizard.confirm.yes : copy.wizard.confirm.no}
                  </span>
                </li>
                <li>
                  {copy.wizard.confirm.role}
                  <span className="font-medium text-foreground">{roleLabel(String(data.role))}</span>
                </li>
              </ul>
            ),
          },
        ]}
        onComplete={() => {
          setWizardOpen(false)
          toast.success(copy.wizard.done.title, {
            description: copy.wizard.done.description,
          })
        }}
      />
    </div>
  )
}
