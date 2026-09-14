import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { messages } from "@/lib/i18n"
import { loadBearingResearch } from "@/lib/research"
import { FindingView } from "@/components/research/finding-view"

/**
 * `/r/[researchId]/finding` —— 交付物。
 *
 * ## 为什么它是 route，而来源 / 论断 / 张力 / 轨迹不是
 *
 * Phase 2 IA 的判据是：**稳定、可分享、可引用的对象才是 route**。
 *
 * ```
 * Finding     定稿的结论     → 会被引用、会被转发      → route
 * Source      工作材料       → 是工作区里的东西        → drawer
 * Claim       论证的一环     → 是工作区里的东西        → 工作区内
 * Tension     待处理的问题   → 是工作区里的东西        → rail / sheet
 * Trace       研究的经过     → 是工作区里的东西        → drawer
 * ```
 *
 * 所以本阶段只新增**这一条** route：没有 `/sources`、`/trace`、
 * `/tensions`、`/claims`、`/ai`。把它们都做成 route，等于把这个产品
 * 变回一个有五个二级页面的后台。
 *
 * ## 它渲染的是数据集，不是工作区的实时状态
 *
 * 交付物是**快照**。工作区是活的（客户端状态），而一份会随本地编辑变化的
 * 交付物既不可分享也不可引用。这一页因此是 Server Component，
 * 并且带上 `generatedAt`——读者知道它反映的是哪一刻。
 */
export const dynamicParams = false

export function generateStaticParams() {
  return [{ researchId: loadBearingResearch.research.id }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ researchId: string }>
}): Promise<Metadata> {
  const { researchId } = await params
  const t = messages.research.finding.meta
  if (researchId !== loadBearingResearch.research.id) {
    return { title: t.titleFallback }
  }
  return {
    title: `${loadBearingResearch.research.title ?? t.titleFallback} · ${messages.research.finding.heading}`,
    description: t.description,
  }
}

export default async function FindingPage({
  params,
}: {
  params: Promise<{ researchId: string }>
}) {
  const { researchId } = await params
  if (researchId !== loadBearingResearch.research.id) notFound()

  /* 数据集里只有一份交付物——`Finding` 是研究者署名的那一个对象。
     没有它时（例如研究还没收敛）不编一份空的出来：
     一份空交付物比「还没有结论」更糟。 */
  const finding = loadBearingResearch.findings[0]
  if (!finding) notFound()

  return <FindingView data={loadBearingResearch} finding={finding} />
}
