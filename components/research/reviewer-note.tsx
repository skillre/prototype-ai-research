"use client"

/**
 * Reviewer Note —— 一条审稿意见。
 *
 * ## 它必须看起来像审稿意见，不像聊天消息
 *
 * 具体到四条机械约束（都有测试）：
 *
 * 1. **没有输入框**——除非用户主动点了「驳回 / 接受」。审稿人不接受提问：
 *    它只对已有的事实说话。聊天框一旦存在，产品就会开始往 Copilot 漂。
 * 2. **每条都附着在它评论的对象上**（论断 / 张力），不是一条时间流。
 *    时间流没有位置感，而位置感正是「这条意见在说哪一环」的载体。
 * 3. **三类输出的标签不同、排版也不同**（见 CSS）：
 *    `AI 批评` 用强调条、`AI 抽取的事实` 走正文、`AI 建议` 最弱且带免责。
 * 4. **不是卡片**：没有圆角盒子 + 阴影，只有左侧一条规则线 + 标签。
 *    卡片是外壳的语言；旁注是文稿的语言。
 *
 * ## 为什么拒绝也要填理由
 *
 * 因为半年后要能回答「为什么当初没采纳这条」。只记一个「已驳回」等于没记。
 */

import { useId, useRef, useState } from "react"
import { messages } from "@/lib/i18n"
import type { DispositionIssue } from "@/lib/research"
import type { ReviewerNote } from "@/lib/research-ui"

const t = messages.research.reviewer

export type ReviewerDecision = "acknowledged" | "rejected"

export function ReviewerNoteCard({
  note,
  onDecide,
  onOpenDisposition,
}: {
  note: ReviewerNote
  onDecide: (
    noteId: string,
    decision: ReviewerDecision,
    reason: string,
  ) => { ok: true } | { ok: false; issues: DispositionIssue[] }
  /** 处置入口：把用户送到「未处理」清单里那条**同一条**缺口上。 */
  onOpenDisposition: (tensionId: string) => void
}) {
  const [form, setForm] = useState<ReviewerDecision | null>(null)
  const [reason, setReason] = useState("")
  const [issues, setIssues] = useState<DispositionIssue[]>([])
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const uid = useId()
  const fieldId = `${uid}-reason`

  const submit = () => {
    if (!form) return
    const outcome = onDecide(note.id, form, reason)
    if (outcome.ok) {
      setForm(null)
      setReason("")
      setIssues([])
      return
    }
    setIssues(outcome.issues)
    reasonRef.current?.focus()
  }

  const stateLabel =
    note.state === "acknowledged"
      ? t.stateAcknowledged
      : note.state === "rejected"
        ? t.stateRejected
        : t.statePending

  return (
    <div
      className="rs-note"
      data-note-id={note.id}
      data-note-class={note.outputClass}
      data-note-state={note.state}
      data-note-provenance={note.provenance}
      data-tension-id={note.tensionId ?? undefined}
    >
      <p className="rs-note__head">
        {/* 类别标签。三类必须一眼可分——这是 §18 的落点。 */}
        <span className="rs-note__class">{t.classLabel[note.outputClass]}</span>
        <span className="rs-note__provenance">
          {note.provenance === "authored" ? t.provenanceAuthored : t.provenanceDerived}
        </span>
        {/* 状态：**只有被采纳或被驳回时**才出现。待处理是默认态，不需要徽章——
            给每个条目都挂一个「待处理」会让它变成装饰。 */}
        {note.state === "pending" ? null : (
          <span className="rs-note__state" data-testid={`note-state-${note.id}`}>
            {stateLabel}
          </span>
        )}
        {/* 指向的张力。**这是「不建立第二套事实模型」的证据**：
            意见说的是领域层已经推导出来的那条张力——同一个 id，不是第二套。
            机器可读的 id 放在 `data-tension-id` 上（见根元素），
            人读的是「对应未处理：无证据支撑」。 */}
        {note.tensionId ? (
          <span className="rs-note__tension" data-testid={`note-tension-${note.id}`}>
            {t.tensionRef(note.tensionKind ? messages.research.rail.kind[note.tensionKind] : "")}
          </span>
        ) : null}
      </p>

      <p className="rs-note__text">{note.text}</p>

      {note.detail ? <p className="rs-note__detail">{note.detail}</p> : null}

      {note.passageIds.length > 0 ? (
        <p className="rs-note__passages">
          {note.passageLabels.map((label, index) => (
            <span key={note.passageIds[index]} data-passage-id={note.passageIds[index]}>
              {label}
            </span>
          ))}
        </p>
      ) : null}

      {note.nextStep ? <p className="rs-note__next">{note.nextStep}</p> : null}

      {note.outputClass === "suggestion" ? (
        <p className="rs-note__disclaimer">{t.suggestionNote}</p>
      ) : null}

      {form ? (
        <div className="rs-note__form">
          <label className="kits-label" htmlFor={fieldId}>
            {t.reasonLabel}
          </label>
          <textarea
            id={fieldId}
            ref={reasonRef}
            className="rs-disposition__reason"
            rows={2}
            value={reason}
            placeholder={
              form === "rejected" ? t.reasonPlaceholderReject : t.reasonPlaceholderAcknowledge
            }
            onChange={(event) => {
              setReason(event.target.value)
              if (issues.length > 0) setIssues([])
            }}
          />
          {issues.length > 0 ? (
            <ul className="rs-note__issues" role="alert">
              {issues.map((issue) => (
                <li key={issue.code} data-issue-code={issue.code}>
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="rs-disposition__actions">
            <button type="button" className="rs-action kits-control" onClick={submit}>
              {form === "rejected" ? t.submitReject : t.submitAcknowledge}
            </button>
            <button
              type="button"
              className="rs-action rs-action--quiet kits-control"
              onClick={() => {
                setForm(null)
                setIssues([])
              }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : note.provenance === "derived" || note.state === "rejected" ? (
        /* 自动检查得出的批评**没有**驳回 / 接受。
           它不是一条 AI 输出——没有一条被存下来的对象可以被驳回。
           给它一对驳回按钮会伪造一个不存在的对象，并让轨迹里出现
           一条指向虚构 subject 的记录。它唯一的出口是去处置那条张力。 */
        <div className="rs-note__actions">
          <p className="rs-note__derived-hint">{t.derivedHint}</p>
          {note.tensionId ? (
            <button
              type="button"
              className="rs-action kits-control"
              data-testid={`note-dispose-${note.id}`}
              onClick={() => onOpenDisposition(note.tensionId!)}
            >
              {t.derivedAction}
            </button>
          ) : null}
        </div>
      ) : note.state === "pending" ? (
        <div className="rs-note__actions">
          {note.outputClass === "critique" ? (
            <button
              type="button"
              className="rs-action kits-control"
              data-testid={`note-acknowledge-${note.id}`}
              onClick={() => setForm("acknowledged")}
            >
              {t.acknowledge}
            </button>
          ) : null}
          <button
            type="button"
            className="rs-action rs-action--quiet kits-control"
            data-testid={`note-reject-${note.id}`}
            onClick={() => setForm("rejected")}
          >
            {t.reject}
          </button>
        </div>
      ) : null}
    </div>
  )
}
