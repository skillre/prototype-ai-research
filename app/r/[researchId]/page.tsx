import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { messages } from "@/lib/i18n"
import { loadBearingResearch } from "@/lib/research"
import { projectArgumentChain } from "@/lib/research-ui"
import { ResearchWorkspace } from "@/components/research/research-workspace"

/**
 * `/r/[researchId]` —— 研究工作区。
 *
 * ## 本阶段只做这一条 route
 *
 * 没有 `/sources`、`/claims`、`/tensions`、`/ai`、`/settings`、`/dashboard`。
 * **对象不是 route**：来源、论断、张力都是这一屏里的东西，不是要导航过去的
 * 目的地。给它们各开一条 route，等于把这个产品拆成一个后台管理系统，
 * 而那正是 firstVisual 要避免的形状。
 *
 * ## 为什么是 Server Component
 *
 * 一条 Argument Chain 的组装（分组、排序、缺口推导）全是纯函数，没有一条
 * 需要浏览器。放在服务端做，客户端就只需要管展开与滚动。
 *
 * ## 数据集与 404
 *
 * 本阶段只有一份确定性数据集（`lib/research/dataset.ts`），id 是
 * `res-load-bearing`。`generateStaticParams` 把它列成唯一可预渲染的值，
 * `dynamicParams = false` 让任何别的 id 直接 404 —— 这比渲染一个空壳诚实：
 * 「研究不存在」和「研究存在但没有任何内容」是两件事，不能长得一样。
 *
 * 注意 `dynamicParams = false` 的**实际后果**（实测）：别的 id 根本不在路由表里，
 * 因此渲染的是全站 `app/not-found.tsx`，而不是本目录下的 not-found。
 * 所以那个目录级的 `not-found.tsx` 已经删掉了——留一份永不执行的兜底
 * 会让人以为改它能改 404 的样子。下面这两处防御性检查保留，因为它们
 * 覆盖的是「路由放行但数据里没有」这条路径，与 `dynamicParams` 无关。
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

  const e = messages.research.evidence
  const chain = projectArgumentChain(loadBearingResearch, {
    page: e.page,
    anchor: e.anchor,
    timecode: e.timecode,
  })

  return <ResearchWorkspace chain={chain} />
}
