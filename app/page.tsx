"use client"

import Link from "next/link"
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckCircle2Icon,
  MousePointerClickIcon,
  PaintbrushIcon,
  TerminalSquareIcon,
  TestTube2Icon,
  type LucideIcon,
} from "lucide-react"
import { FadeIn } from "@/components/motion/fade-in"
import { StaggerContainer } from "@/components/motion/stagger-container"
import { AmbientBackdrop } from "@/components/prototype/ambient-backdrop"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useMessages } from "@/components/i18n/locale-provider"
import { loadBearingResearch } from "@/lib/research"

/** 图标与文案一一对应——文案在词典里，图标留在组件里。 */
const FEATURE_ICONS: LucideIcon[] = [
  MousePointerClickIcon,
  PaintbrushIcon,
  TerminalSquareIcon,
  TestTube2Icon,
]

export default function LandingPage() {
  const t = useMessages()
  const copy = t.landing

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b">
        <AmbientBackdrop variant="hero" grid />
        <div className="relative mx-auto flex w-full max-w-content flex-col items-center gap-6 px-gutter py-20 text-center sm:py-28">
          <FadeIn>
            <Badge variant="outline" className="gap-1.5 bg-surface/70 text-label tracking-normal">
              <BlocksIcon className="size-3.5" />
              {copy.badge}
            </Badge>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="text-display">{copy.title}</h1>
          </FadeIn>
          <FadeIn delay={0.16}>
            <p className="max-w-xl text-body text-muted-foreground sm:text-subtitle">
              {copy.description}
            </p>
          </FadeIn>
          <FadeIn delay={0.24} className="flex flex-wrap items-center justify-center gap-3">
            {/*
             * 这个入口指向的是 **Reference Sample**（`app/demo/**`），不是本产品的界面。
             * `data-reference-sample` 把它标成示例入口：产品可以保留参考示例，但不能
             * 把它当成产品的主入口——`pnpm factory:init` 的初始化边界检查读的就是这个标记
             * （见 init-contract.json 与 AGENTS.md「初始化边界」）。
             */}
            <Link href="/demo" data-reference-sample className={buttonVariants({ size: "lg" })}>
              {copy.primaryCta}
              <ArrowRightIcon />
            </Link>
            <Link
              href={`/r/${loadBearingResearch.research.id}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {copy.researchCta}
            </Link>
            <Link href="#stack" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              {copy.tertiaryCta}
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-b bg-muted/40">
        <StaggerContainer className="mx-auto grid w-full max-w-content grid-cols-2 gap-x-6 gap-y-3 px-gutter py-8 sm:grid-cols-3">
          {copy.highlights.map((item) => (
            <div key={item} className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 shrink-0 text-success" />
              <span>{item}</span>
            </div>
          ))}
        </StaggerContainer>
      </section>

      {/* Stack */}
      <section id="stack" className="mx-auto w-full max-w-content px-gutter py-16 sm:py-20">
        <FadeIn className="mb-10 flex flex-col gap-2">
          <h2 className="text-title">{copy.stackTitle}</h2>
          <p className="max-w-lg text-body text-muted-foreground">
            {copy.stackDescriptionPrefix}{" "}
            <code className="rounded-field bg-muted px-1.5 py-0.5 font-mono text-label">/demo</code>{" "}
            {copy.stackDescriptionSuffix}
          </p>
        </FadeIn>
        <StaggerContainer className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
          {copy.features.map((item, index) => {
            const Icon = FEATURE_ICONS[index] ?? MousePointerClickIcon
            /* 能力清单读起来应该像一份规格表：四块排开的文字 + hairline，
               而不是四张一模一样的卡片。图标只是行首的一个标记。 */
            return (
              <div
                key={item.title}
                className="flex gap-3.5 border-t border-hairline py-6"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-field bg-brand-soft text-brand">
                  <Icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="text-body font-semibold">{item.title}</h3>
                  <p className="text-body-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            )
          })}
        </StaggerContainer>

        <div className="mt-10 flex flex-col gap-1 overflow-x-auto border-l-2 border-brand/45 py-1 pl-4 font-mono text-label leading-relaxed text-muted-foreground">
          {copy.commands.map((command) => (
            <span key={command} className="whitespace-nowrap">
              <span className="mr-2 text-brand">$</span>
              {command}
            </span>
          ))}
        </div>
      </section>

      <footer className="border-t py-6">
        <p className="mx-auto w-full max-w-content px-gutter text-center text-label text-muted-foreground">
          {copy.footer}
        </p>
      </footer>
    </main>
  )
}
