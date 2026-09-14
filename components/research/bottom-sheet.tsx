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
  variant = "bottom",
  testId = "bottom-sheet",
  children,
}: {
  labelId: string
  title: string
  onClose: () => void
  /**
   * 位置。
   *
   * ```
   * bottom      底部抽屉。移动端处置面板用它。
   * responsive  窄屏底部、宽屏右侧。Source Index 与 Trace 用它——
   *             它们**两种视口下都要有**，而处置面板只在移动端存在
   *             （桌面走窄带内联面板）。
   * ```
   *
   * ## 为什么是同一个 primitive 的一个 prop，而不是第二个 modal 组件
   *
   * 下面那四件事（焦点进入 / Tab 循环 / Escape / 焦点归还）与位置无关，
   * 而它们是模态的全部难点。复制一份出来改定位，等于把「哪些行为必须保住」
   * 变成两份需要各自维护的清单——第二份迟早会漏掉一条，
   * 而漏掉的那条不会有任何东西报错。
   *
   * 定位本身交给 CSS（媒体查询），所以这里没有 `matchMedia`。
   */
  variant?: "bottom" | "responsive"
  /** 稳定的测试钩子。多个抽屉同时存在于代码里时，它们必须能被区分。 */
  testId?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  /* 打开之前聚焦在哪个元素上。关闭时要还回去——这是 ④。 */
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    restoreTo.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null

    /* ① 焦点进入抽屉：优先**内容区的**第一个可聚焦控件。
       直接 `panel.querySelector(FOCUSABLE)` 会落在标题行的「关闭」上——
       那对键盘用户是一次额外的 Tab，而抽屉打开时他想要的是表单的第一个字段。
       「关闭」仍然在 Tab 循环里（它是循环的第一个落点），只是不抢初始焦点。 */
    const body = panelRef.current?.querySelector<HTMLElement>(".rs-sheet__body")
    const target =
      body?.querySelector<HTMLElement>(FOCUSABLE) ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()

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
    <div className="rs-sheet-layer" data-testid={`${testId}-layer`}>
      {/* 遮罩：点击关闭。它没有可聚焦内容，所以点击外部时页面不会失焦到虚空。 */}
      <div className="rs-sheet-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={`rs-sheet${variant === "responsive" ? " rs-sheet--responsive" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        data-testid={testId}
        data-variant={variant}
        onKeyDown={onKeyDown}
      >
        {/* 关闭按钮放在标题行里，**不占一个固定在右下角的浮标**：
            浮标会盖住内容，而抽屉的内容是可滚动的长清单。
            它同时是 `Tab` 顺序的第一个元素，所以 Tab 循环的第一个落点
            是「关闭」——一个键盘用户可以立刻退出去。 */}
        <div className="rs-sheet__head">
          <p className="rs-sheet__title" id={labelId}>
            {title}
          </p>
          <button
            type="button"
            className="rs-sheet__close kits-control"
            data-testid={`${testId}-close`}
            onClick={onClose}
          >
            {t.cancel}
          </button>
        </div>
        <div className="rs-sheet__body">{children}</div>
      </div>
    </div>
  )
}

/** 抽屉外壳的标题由调用方决定；这里只保证它有一个稳定的 id。 */
export const SHEET_TITLE_ID = "rs-disposition-sheet-title"
