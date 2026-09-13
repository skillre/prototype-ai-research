import type { Metadata } from "next"
import Link from "next/link"
import { NotFoundState } from "@/components/prototype/not-found-state"
import { buttonVariants } from "@/components/ui/button"
import { messages } from "@/lib/i18n"

export const metadata: Metadata = { title: messages.notFound.app.metaTitle }

const t = messages.notFound.app

/**
 * 全站 404。未匹配的 URL 由这里兜底，永远给出真实可用的下一步，避免死胡同。
 *
 * 这里**不列出产品路由**：本仓库目前只有落地页与 Factory 的内置演示 `/demo`。
 * 等产品界面开始出现后，把真实存在的入口加进 `suggestions` 即可——但只加真实存在的，
 * 这个组件的意义就是「不给出死胡同」。
 */
export default function AppNotFound() {
  return (
    <main className="relative flex flex-1 items-center justify-center px-gutter py-16">
      <div className="w-full max-w-content">
        <NotFoundState
          code="404"
          testId="app-not-found"
          title={t.title}
          description={t.description}
          action={{ label: t.action, href: "/demo" }}
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
