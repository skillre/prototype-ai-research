import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { messages } from "@/lib/i18n"
import { loadBearingResearch } from "@/lib/research"
import { ResearchWorkspace } from "@/components/research/research-workspace"

/**
 * `/r/[researchId]` —— 研究工作区。
 *
 * ## 本阶段仍然只做这一条 route
 *
 * 没有 `/sources`、`/claims`、`/tensions`、`/ai`、`/settings`、`/dashboard`。
 * **对象不是 route**：来源、论断、张力、审稿意见都是这一屏里的东西，
 * 不是要导航过去的目的地。
 *
 * ## 为什么现在传的是 `ResearchData` 而不是组装结果
 *
 * Phase D 这里传的是 `projectArgumentChain(...)` 的结果，因为当时没有任何东西
 * 会改动数据。Phase E 引入了处置——它会**改变 `ResearchData`**——所以状态
 * 必须活在客户端，组装也必须跟着在客户端重算。
 *
 * 于是这一层只做两件事：认 id、把数据集交出去。它是 Server Component，
 * 所以首屏 HTML 仍然在服务端渲染（不是空壳 + 客户端填充）。
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
  const t = messages.research.meta
  if (researchId !== loadBearingResearch.research.id) {
    return { title: t.titleFallback }
  }
  return {
    title: loadBearingResearch.research.title ?? t.titleFallback,
    description: t.description,
  }
}

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ researchId: string }>
}) {
  const { researchId } = await params
  if (researchId !== loadBearingResearch.research.id) notFound()

  /* 注意：这里传的是**数据**，不是组装结果。
     数据集是 `ResearchData`（纯 JSON），可以跨 server/client 边界。 */
  return <ResearchWorkspace initialData={loadBearingResearch} />
}
