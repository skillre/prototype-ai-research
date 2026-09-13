import type { Metadata } from "next"
import Link from "next/link"
import { NotFoundState } from "@/components/prototype/not-found-state"
import { buttonVariants } from "@/components/ui/button"
import { messages } from "@/lib/i18n"
import { loadBearingResearch } from "@/lib/research"

export const metadata: Metadata = { title: messages.notFound.app.metaTitle }

const t = messages.notFound.app
const tr = messages.research.notFound
const researchHref = `/r/${loadBearingResearch.research.id}`

/**
 * 全站 404。未匹配的 URL 由这里兜底，永远给出真实可用的下一步，避免死胡同。
 *
 * ## 为什么研究那条路由的 404 也落在这里（实测，不是猜测）
 *
 * `/r/[researchId]` 声明了 `dynamicParams = false`，所以除了数据集里那一个 id，
 * 别的值**根本不在路由表里**——Next 直接走全站 404，
 * 而 `app/r/[researchId]/not-found.tsx` 永远不会被渲染。
 * 这是实测出来的：请求 `/r/res-does-not-exist` 返回 404，
 * 页面上是 `app-not-found`，不是那个路由自己的 not-found。
 *
 * 于是把它删掉了——留一份永远不会执行的兜底，比没有兜底更糟：
 * 它让人以为改那个文件能改 404 的样子。
 *
 * ## 它现在必须说清是哪一层不存在
 *
 * 「这一屏不存在」和「这项研究不存在」是两件事：后者要求用户换一个 id，
 * 前者要求用户换一条路。所以文案改成研究语境，并且给出**真实存在**的那个入口
 * （href 由数据集推导，不是手抄的字符串——换 id 时它跟着换）。
 */
export default function AppNotFound() {
  return (
    <main className="relative flex flex-1 items-center justify-center px-gutter py-16">
      <div className="w-full max-w-content">
        <NotFoundState
          code="404"
          testId="app-not-found"
          title={tr.title}
          description={tr.description}
          action={{ label: tr.action, href: researchHref }}
        />
        <div className="mt-6 flex justify-center">
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t.backHome}
          </Link>
        </div>
      </div>
    </main>
  )
}
