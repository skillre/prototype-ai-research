import { AmbientBackdrop } from "@/components/prototype/ambient-backdrop"
import { cn } from "@/lib/utils"

type PageContainerProps = {
  /** Small line above the H1 — breadcrumb / section context. */
  eyebrow?: string
  title?: string
  description?: string
  /** Right-aligned header actions (buttons, selectors). */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Constrain content width; passthrough to the inner wrapper. */
  contentClassName?: string
  /** Set false on dense pages (board, wide table) that need the full canvas. */
  ambient?: boolean
  /**
   * `full`    — eyebrow + display-ish title + description. For pages where the
   *             title is the entry point (客户 / 任务 / 活动 / 详情).
   * `compact` — one tight row: small title + actions. For pages that open with
   *             their own protagonist region (总览的 Hero)，避免标题和主视觉
   *             抢同一个高度。
   * `none`    — no header at all; the page owns its own opening.
   */
  variant?: "full" | "compact" | "none"
}

/**
 * Standard page shell: an optional ambient backdrop, a header block with a
 * clear type hierarchy, then the content on a consistent max width.
 *
 * V3 note on the ambient layer: it is off by default for pages that carry
 * their own protagonist region. Two light sources on one screen is what makes
 * a page look "decorated" instead of art-directed.
 */
export function PageContainer({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ambient = true,
  variant = "full",
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "relative isolate mx-auto w-full max-w-dashboard px-gutter py-6 sm:px-8 sm:py-6",
        className
      )}
    >
      {ambient ? <AmbientBackdrop variant="page" /> : null}

      {variant === "none" || !title ? null : variant === "compact" ? (
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-heading text-balance">{title}</h1>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow ? (
              <span className="eyebrow text-brand">
                <span aria-hidden className="section-tick" />
                {eyebrow}
              </span>
            ) : null}
            <h1 className="text-title text-balance">{title}</h1>
            {description ? (
              <p className="text-body-sm text-pretty text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
          ) : null}
        </div>
      )}

      <div className={cn("flex flex-col gap-6", contentClassName)}>{children}</div>
    </div>
  )
}
