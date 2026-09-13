"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type LoadingStateProps = {
  variant?: "cards" | "rows" | "section"
  /** Meaningful for `rows` (skeleton lines). */
  count?: number
  className?: string
}

/** 与 MetricStrip 相同的竖分隔线位置，保证骨架和真身对齐。 */
const METRIC_DIVIDERS = [
  "",
  "border-l",
  "border-t lg:border-t-0 lg:border-l",
  "border-t border-l lg:border-t-0",
]

/**
 * Layout-preserving loading placeholders. `cards` mirrors the dashboard's
 * **hero + metric strip** composition, `rows` mirrors a table, `section` is a
 * single content block.
 *
 * 骨架的价值在于"换上去的时候页面不动"，所以它的形状必须跟着真实构图走。
 * V3 把 `cards` 从 4 张卡片的网格改成 hero + 指标带：如果仍然画卡片墙，
 * 加载完成的那一刻整页会明显地重排一次，那比没有骨架更糟。
 */
export function LoadingState({ variant = "cards", count = 4, className }: LoadingStateProps) {
  if (variant === "cards") {
    return (
      <div className={cn("flex flex-col gap-9", className)}>
        <div className="flex flex-col gap-6 rounded-panel bg-surface/50 px-4 py-6 sm:px-6 sm:py-8">
          <Skeleton className="h-3 w-24" />
          <div className="grid gap-7 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-end">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-52" />
              <Skeleton className="h-3.5 w-40" />
            </div>
            <Skeleton className="h-[190px] w-full rounded-card sm:h-[210px]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-5 lg:grid-cols-4">
          {METRIC_DIVIDERS.map((divider, index) => (
            <div
              key={index}
              className={cn(
                "flex flex-col gap-2 border-hairline px-4 odd:pl-0 lg:px-6 lg:first:pl-0",
                divider
              )}
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "rows") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <Skeleton className="h-9 w-full max-w-64" />
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3.5 w-full max-w-md" />
      <Skeleton className="mt-3 h-40 w-full rounded-card" />
    </div>
  )
}
