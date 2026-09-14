"use client"

/**
 * Disposition Panel —— 处置一个缺口。
 *
 * ## 它存在的理由不是「加个按钮」
 *
 * 这一整个阶段要证明的是**产品能区分「解决它」和「接受它」**。所以这个面板
 * 的形状是围绕那个区分设计的：
 *
 * ```
 * ( ) 标记为已解决        事实断言：这个洞不再存在了。
 * (•) 接受为已知局限      判断：洞还在，但我决定带着它交付。
 *
 * 理由  [                              ]
 *
 * [取消]  [接受为局限]
 * ```
 *
 * 三处刻意的决定：
 *
 * 1. **两个出口同时可见**，不是「先选类型再填表」。它们是两种判断，
 *    用户需要同时看到才能比较。
 * 2. **默认选中「接受为已知局限」**。默认值就是一种推荐——界面不该
 *    把用户往「声称自己解决了」那一边推。而事实上，对一条事实未变的
 *    缺口来说，接受局限是唯一诚实的出口。
 * 3. **「标记为已解决」不会被禁用，即使它一定会失败。** 领域层会拒绝它
 *    并给出理由，而那个理由正是用户需要读到的东西。把它灰掉等于把
 *    这条规则藏起来（见 `lib/research/operations.ts` 的不变量 13）。
 *
 * ## 拒绝不是错误弹窗
 *
 * 处置被拒时，理由**留在面板里**，用户可以就地改。把守卫的理由放进 toast，
 * 用户读完就没了，还得重新打开面板——那会让「先试试看能不能标记为已解决」
 * 变成一件有成本的事，而它不该有成本：它是这个产品最主要的教学时刻。
 */

import { useId, useRef, useState } from "react"
import { messages } from "@/lib/i18n"
import type { DispositionIssue, TensionKind, TensionResolution } from "@/lib/research"

const t = messages.research.disposition
const rail = messages.research.rail

export type DispositionSubmit = (
  resolution: TensionResolution,
  reason: string,
) => { ok: true } | { ok: false; issues: DispositionIssue[] }

export function DispositionPanel({
  /** 同一个面板会在桌面窄带与移动抽屉里各渲染一次（其中一个被 CSS 隐藏），
   *  所以 id 必须带位置前缀——重复 id 会让 label 关联到错误的那一个。 */
  idPrefix,
  tensionId,
  tensionKind,
  severity,
  claimIndex,
  reasonHint,
  /** 面板自己的标题。放进抽屉时关掉——抽屉已经有标题了，
   *  同一屏上把同一句话写两遍是最容易被忽略的那种冗余。 */
  showTitle = true,
  /**
   * 默认选中的出口。默认是 `accepted-as-limitation`。
   *
   * ## 什么时候应该换成 `resolved`
   *
   * 只有一种情形：**刚刚发生了事实改变**。Source Index 里补完一条引用之后，
   * 面板是被这次操作本身叫出来的（见 `addEvidenceLink` 的 `closedTensions`），
   * 那时 `resolved` 是**唯一成立**的出口，把它设为默认是诚实的。
   *
   * 其余任何地方都必须保持 `accepted-as-limitation` 为默认——
   * 默认值就是一种推荐，而界面不该把用户往「声称自己解决了」那边推。
   */
  defaultResolution = "accepted-as-limitation",
  onSubmit,
  onClose,
}: {
  idPrefix: string
  tensionId: string
  tensionKind: TensionKind
  severity: "blocking" | "notable"
  claimIndex: number | undefined
  /** 已知局限的默认理由（若这条缺口已经有处置历史）。 */
  reasonHint?: string
  showTitle?: boolean
  defaultResolution?: TensionResolution
  onSubmit: DispositionSubmit
  onClose: () => void
}) {
  const fieldId = `${idPrefix}-reason`
  const resolveId = `${idPrefix}-resolve`
  const acceptId = `${idPrefix}-accept`
  const describedBy = `${idPrefix}-distinction`

  const [resolution, setResolution] = useState<TensionResolution>(defaultResolution)
  const [reason, setReason] = useState(reasonHint ?? "")
  const [issues, setIssues] = useState<DispositionIssue[]>([])
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const uid = useId()

  const submit = () => {
    const outcome = onSubmit(resolution, reason)
    if (outcome.ok) {
      onClose()
      return
    }
    /* 被拒绝：理由留在面板里，焦点回到理由字段——用户要改的就是它。 */
    setIssues(outcome.issues)
    reasonRef.current?.focus()
  }

  return (
    <div className="rs-disposition" data-testid={`disposition-panel-${tensionId}`}>
      {showTitle ? (
        <p className="rs-disposition__title">
          <span aria-hidden className="rs-section-label__tick" />
          {t.panelTitle}
        </p>
      ) : null}

      <p className="rs-disposition__subject">
        <span className="kits-label">{rail.kind[tensionKind]}</span>
        <span aria-hidden>·</span>
        <span className="kits-label">{rail.severity[severity]}</span>
        {claimIndex === undefined ? null : (
          <>
            <span aria-hidden>·</span>
            <span className="kits-label">{rail.subjectClaim(claimIndex)}</span>
          </>
        )}
      </p>

      <fieldset className="rs-disposition__choices">
        <legend className="rs-visually-hidden">{t.panelTitle}</legend>

        <label className="rs-disposition__choice" htmlFor={acceptId}>
          <input
            id={acceptId}
            type="radio"
            name={`${uid}-resolution`}
            value="accepted-as-limitation"
            checked={resolution === "accepted-as-limitation"}
            onChange={() => {
              setResolution("accepted-as-limitation")
              setIssues([])
            }}
          />
          <span className="rs-disposition__choice-body">
            <span className="rs-disposition__choice-label">{t.acceptAction}</span>
            <span className="rs-disposition__choice-hint">{t.acceptHint}</span>
          </span>
        </label>

        <label className="rs-disposition__choice" htmlFor={resolveId}>
          <input
            id={resolveId}
            type="radio"
            name={`${uid}-resolution`}
            value="resolved"
            checked={resolution === "resolved"}
            onChange={() => {
              setResolution("resolved")
              setIssues([])
            }}
          />
          <span className="rs-disposition__choice-body">
            <span className="rs-disposition__choice-label">{t.resolveAction}</span>
            <span className="rs-disposition__choice-hint">{t.resolveHint}</span>
          </span>
        </label>
      </fieldset>

      {/* 两个出口的定义差别。它是这个面板里最重要的一段文字。 */}
      <p id={describedBy} className="rs-disposition__distinction">
        {t.distinction}
      </p>

      <div className="rs-disposition__field">
        <label className="kits-label" htmlFor={fieldId}>
          {t.reasonLabel}
        </label>
        <textarea
          id={fieldId}
          ref={reasonRef}
          className="rs-disposition__reason"
          value={reason}
          rows={3}
          aria-describedby={describedBy}
          placeholder={
            resolution === "accepted-as-limitation"
              ? t.reasonPlaceholderAccept
              : t.reasonPlaceholderResolve
          }
          onChange={(event) => {
            setReason(event.target.value)
            if (issues.length > 0) setIssues([])
          }}
        />
      </div>

      {/* 守卫的拒绝理由。`role="alert"` 让它被朗读出来，而不是只在视觉上出现。 */}
      {issues.length > 0 ? (
        <div className="rs-disposition__rejected" role="alert" data-testid="disposition-rejected">
          <p className="rs-disposition__rejected-title">{t.rejectedTitle}</p>
          <ul className="rs-disposition__issues">
            {issues.map((issue) => (
              <li key={issue.code} data-issue-code={issue.code}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rs-disposition__actions">
        <button type="button" className="rs-action kits-control" onClick={submit}>
          {resolution === "accepted-as-limitation" ? t.submitAccept : t.submitResolve}
        </button>
        <button
          type="button"
          className="rs-action rs-action--quiet kits-control"
          onClick={onClose}
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
