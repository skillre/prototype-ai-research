"use client"

/**
 * Trace —— 研究轨迹的抽屉。
 *
 * ## 它不是 activity feed
 *
 * activity feed 说「你做了什么」。这一屏按**对象**分组，因为读者的问题
 * 从来不是「最近发生了什么」，而是：
 *
 * ```
 * 这条论断为什么后来被降级？
 * 这个局限什么时候被接受的？
 * 这条 AI 意见为什么被驳回？
 * 这条引用什么时候加进去的？
 * ```
 *
 * 四个问题的主语都是**对象**，所以分组的主键也是对象。按时间平铺一遍
 * 会得到一份读起来像审计日志的东西，而那正是要避免的形态。
 *
 * ## 每一行都必须有「为什么」
 *
 * 领域层从 Phase A 起就要求每个变更函数都必须收到 `reason`——那不是
 * 为了生成一份好看的日志，而是因为**没有理由的历史不构成研究轨迹**。
 * 所以本组件里 `reason` 是视觉主体，事件类型反而是标签。
 *
 * ## 处置的两个出口在这里仍然是两个词
 *
 * `accepted-as-limitation` 与 `resolved` 在轨迹里显示成
 * 「接受为已知局限」与「标记为已解决」。写成同一个「已处理」会让
 * 「这个局限什么时候被接受的」这个问题失去答案——而轨迹是唯一能回答
 * 它的地方。
 */

import { useMemo, useState } from "react"
import { messages } from "@/lib/i18n"
import type { ResearchData } from "@/lib/research"
import { groupTraceBySubject, projectTrace } from "@/lib/research-ui"
import { TRACE_COPY } from "@/lib/research-ui/copy"

const t = messages.research.trace

export function TraceDrawer({ data }: { data: ResearchData }) {
  const board = useMemo(() => projectTrace(data, TRACE_COPY), [data])
  const groups = useMemo(() => groupTraceBySubject(data, TRACE_COPY), [data])

  /* 默认展开**最近被改动的那个对象**。
     一进来全部收起的话，读者要点一下才能看到任何轨迹——
     而这一屏存在的理由就是让轨迹可见。 */
  const [openKey, setOpenKey] = useState<string | null>(
    groups[0] ? `${groups[0].type}:${groups[0].id}` : null,
  )

  if (board.rows.length === 0) {
    return <p className="rs-trace__empty kits-label">{t.empty}</p>
  }

  return (
    <div className="rs-trace" data-testid="trace-drawer" data-trace-count={board.rows.length}>
      <p className="rs-sheet__sub">{t.subtitle}</p>
      <p className="rs-trace__summary kits-label">
        <span>{t.count(board.rows.length)}</span>
        <span aria-hidden>·</span>
        <span>{t.subjects(board.subjectCount)}</span>
      </p>

      <ol className="rs-trace__groups">
        {groups.map((group) => {
          const key = `${group.type}:${group.id}`
          const open = openKey === key
          return (
            <li key={key} className="rs-trace__group" data-subject-id={group.id} data-open={open}>
              <button
                type="button"
                className="rs-trace__group-head"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : key)}
              >
                <span className="rs-trace__group-label">{group.label}</span>
                <span className="rs-trace__group-count kits-label numeric">{group.count}</span>
              </button>

              {open ? (
                <ol className="rs-trace__rows">
                  {group.rows.map((row) => (
                    <li
                      key={row.id}
                      className="rs-trace__row"
                      data-trace-kind={row.kind}
                      /* 「事实变了」的记录做得更重一点：读者最需要一眼看到的
                         是论证什么时候被改动过，而不是谁点了什么。 */
                      data-fact-changing={row.factChanging ? "true" : "false"}
                      data-dangling={row.dangling ? "true" : "false"}
                    >
                      {/* 五个要素：谁 / 什么时候 / 对什么 / 做了什么 / 为什么。
                          顺序就是阅读顺序，用 definition list 而不是自由文本——
                          读屏用户需要知道哪一段是「为什么」。 */}
                      <dl className="rs-trace__facts">
                        <dt className="kits-label">{t.atLabel}</dt>
                        <dd className="numeric">{row.dateLabel}</dd>
                        <dt className="kits-label">{t.actorLabel}</dt>
                        <dd>{row.actorLabel}</dd>
                        <dt className="kits-label">{t.kindLabel}</dt>
                        <dd>
                          {row.kindLabel}
                          {/* 处置出口是这句话的宾语，不是标签上的一个附注。 */}
                          {row.resolutionLabel ? (
                            <span className="rs-trace__resolution" data-resolution={row.resolution ?? "unknown"}>
                              {row.resolutionLabel}
                            </span>
                          ) : null}
                        </dd>
                        <dt className="kits-label">{t.subjectLabel}</dt>
                        <dd data-dangling={row.dangling ? "true" : "false"}>
                          {row.dangling ? t.subjectMissing : row.subjectLabel}
                        </dd>
                      </dl>

                      <p className="rs-trace__reason">
                        <span className="kits-label">{t.reasonLabel}</span>
                        <span>{row.reason}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
