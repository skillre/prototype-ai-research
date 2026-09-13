"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { ArrowUpRightIcon, GripVerticalIcon } from "lucide-react"
import { MetricItem, MetricStrip } from "@/components/prototype/metric-strip"
import { SectionHeading } from "@/components/prototype/section-heading"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useMessages } from "@/components/i18n/locale-provider"
import { CHANNEL_SHARE, REVENUE_SERIES, type Priority } from "@/lib/mock-data"
import { useDashboardStore } from "@/stores/dashboard-store"
import { formatCurrency, formatCurrencyCompact, personInitials } from "@/lib/format"
import { durations } from "@/lib/motion-presets"
import { cn } from "@/lib/utils"

/** 与 CRM 图表共用同一套 tooltip 皮肤，保证两个原型看起来是同一个产品线。 */
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  fontSize: 12,
  boxShadow: "var(--elevation-floating)",
  padding: "8px 10px",
}

const TONE_CLASS: Record<Priority["tagTone"], string> = {
  blue: "border-transparent bg-chart-1/15 text-chart-1",
  violet: "border-transparent bg-chart-2/15 text-chart-2",
  emerald: "border-transparent bg-chart-3/15 text-chart-3",
  amber: "border-transparent bg-chart-4/15 text-chart-4",
  rose: "border-transparent bg-chart-5/15 text-chart-5",
}

function SortablePriority({ item }: { item: Priority }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  // 手写 transform（避免依赖 @dnd-kit/utilities —— pnpm 12 对其存在链接 bug）
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`,
        transition,
      }
    : { transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/priority flex cursor-grab touch-none items-center gap-2.5 rounded-field border border-border/60 bg-surface px-3 py-2.5 shadow-subtle transition-[box-shadow,transform,border-color] duration-hover ease-standard active:cursor-grabbing",
        "hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card",
        isDragging && "-translate-y-0.5 rotate-[0.6deg] border-brand/40 shadow-floating ring-1 ring-brand/25"
      )}
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/60 transition-colors duration-hover group-hover/priority:text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{item.title}</span>
      <Badge className={cn("h-5 px-1.5 text-label tracking-normal", TONE_CLASS[item.tagTone])}>
        {item.tag}
      </Badge>
    </li>
  )
}

export function PriorityList() {
  const priorities = useDashboardStore((s) => s.priorities)
  const reorderPriorities = useDashboardStore((s) => s.reorderPriorities)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = priorities.findIndex((p) => p.id === active.id)
    const to = priorities.findIndex((p) => p.id === over.id)
    if (from === -1 || to === -1) return
    reorderPriorities(arrayMove(priorities, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={priorities.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {priorities.map((item) => (
            <SortablePriority key={item.id} item={item} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

export function OverviewSection() {
  const t = useMessages()
  const kpis = useDashboardStore((s) => s.kpis)
  const activities = useDashboardStore((s) => s.activities)
  const copy = t.demo.overview

  return (
    <div className="flex flex-col gap-9">
      {/* 次级指标带：与 CRM 同一套构图，指标不再被四张等宽卡片包住。 */}
      <MetricStrip>
        <MetricItem
          label={copy.kpi.mrr}
          value={kpis.mrr}
          format="currency"
          delta={kpis.mrrDelta}
          deltaLabel={copy.kpi.vsLastMonth}
        />
        <MetricItem
          label={copy.kpi.accounts}
          value={kpis.activeUsers}
          format="integer"
          delta={kpis.activeUsersDelta}
          deltaLabel={copy.kpi.vsLastMonth}
        />
        <MetricItem
          label={copy.kpi.conversion}
          value={kpis.conversionRate}
          format="percent"
          delta={kpis.conversionDelta}
          deltaLabel={copy.kpi.vsLastMonth}
        />
        <MetricItem
          label={copy.kpi.session}
          value={kpis.avgSessionSeconds}
          format="duration"
          delta={kpis.avgSessionDelta}
          deltaLabel={copy.kpi.vsLastMonth}
        />
      </MetricStrip>

      {/* 图表：开放式区块，只有一块地面，不再各套一张卡 */}
      <div className="grid gap-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHeading title={copy.revenue.title} description={copy.revenue.description} />
          <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={REVENUE_SERIES} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.36} />
                  <stop offset="70%" stopColor="var(--chart-1)" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 6"
                stroke="var(--border)"
                vertical={false}
                opacity={0.7}
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={10}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
                width={52}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name) === "revenue"
                    ? copy.revenue.seriesRevenue
                    : copy.revenue.seriesExpenses,
                ]}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
                itemStyle={{ color: "var(--foreground)" }}
                cursor={{ stroke: "var(--brand)", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name="expenses"
                stroke="var(--chart-2)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="transparent"
                animationDuration={durations.glacial * 1000}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="revenue"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#revenue-fill)"
                animationDuration={durations.glacial * 1000}
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <SectionHeading title={copy.channel.title} description={copy.channel.description} />
          <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={CHANNEL_SHARE}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                strokeWidth={0}
                animationDuration={durations.glacial * 1000}
              >
                {CHANNEL_SHARE.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value}%`]}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "var(--foreground)" }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 本周聚焦 + 最近动态：开放式区块，只有排版与 hairline */}
      <div className="grid gap-9 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHeading title={copy.focus.title} description={copy.focus.description} />
          <PriorityList />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <SectionHeading title={copy.recent.title} description={copy.recent.description} />
          <ul className="flex flex-col gap-3.5">
            {activities.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-start gap-3">
                <Avatar size="sm">
                  <AvatarFallback className="text-label">
                    {personInitials(event.actor, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-body-sm">
                    <span className="font-medium">{event.actor}</span>{" "}
                    <span className="text-muted-foreground">{event.action}</span>
                  </p>
                  <span className="text-label text-muted-foreground">{event.time}</span>
                </div>
                <ArrowUpRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
