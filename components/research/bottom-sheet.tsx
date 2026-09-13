"use client"

/**
 * Bottom Sheet —— 移动端的处置容器。
 *
 * ## 为什么是抽屉而不是行内展开
 *
 * 390px 下把处置表单直接展开在窄带里，会把首屏顶下去——而首屏的第一视觉
 * 是那个缺口，**它不能被挤掉**（Phase D 的 fold gate）。抽屉覆盖在内容之上，
 * 不改变任何 layout，因此不可能引起第一视觉回归。
 *
 * ## 无障碍不是「加个 role」
 *
 * 一个模态抽屉必须同时做到四件事，缺一件就是坏的：
 *
 * ```
 * ① 打开时焦点进入抽屉           否则键盘用户还在背后那一屏上
 * ② Tab 在抽屉内循环             否则会 Tab 到背后看不见的内容上
 * ③ Escape 关闭                  否则键盘用户出不去
 * ④ 关闭后焦点回到触发它的控件    否则用户被丢回页面顶部
 * ```
 *
 * 全部手写是因为它们都是**可测的**（tests/research-disposition.spec.ts 逐条断言），
 * 而用一个我不控制内部实现的第三方抽屉时，我要验证的还是这四件事——
 * 那还不如把被测对象写成我能读懂的 40 行。
 *
 * ## 关闭时**不存在**
 *
 * 抽屉是条件渲染的，不是 CSS 隐藏。CSS 隐藏的模态内容仍然可被 Tab 到、
 * 仍然在无障碍树里——那正是「看得见的内容被藏了」的反面。
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { messages } from "@/lib/i18n"

const t = messages.research.disposition

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BottomSheet({
  labelId,
  title,
  onClose,
  children,
}: {
  labelId: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  /* 打开之前聚焦在哪个元素上。关闭时要还回去——这是 ④。 */
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    restoreTo.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null

    /* ① 焦点进入抽屉：优先第一个可聚焦控件（通常是第一个单选项）。 */
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    return () => {
      /* ④ 焦点归还。注意触发控件在抽屉打开期间一直在 DOM 里，
         所以这里能可靠地聚焦回去。 */
      restoreTo.current?.focus()
    }
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      /* ② Tab 循环。 */
      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      }
    },
    [onClose],
  )

  return (
    <div className="rs-sheet-layer" data-testid="disposition-sheet-layer">
      {/* 遮罩：点击关闭。它没有可聚焦内容，所以点击外部时页面不会失焦到虚空。 */}
      <div className="rs-sheet-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="rs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        data-testid="disposition-sheet"
        onKeyDown={onKeyDown}
      >
        <p className="rs-sheet__title" id={labelId}>
          {title}
        </p>
        <div className="rs-sheet__body">{children}</div>
      </div>
    </div>
  )
}

/** 抽屉外壳的标题由调用方决定；这里只保证它有一个稳定的 id。 */
export const SHEET_TITLE_ID = "rs-disposition-sheet-title"
export const sheetCloseLabel = t.cancel
