/**
 * Anchored Question —— sticky 的研究问题。
 *
 * ## 它为什么必须 sticky
 *
 * 论证链很长。一旦问题滚出视野，读者读到第 4 条论断时已经不知道自己
 * 在回答什么了——而「这条论断到底在不在回答那个问题」正是这份材料
 * 唯一的价值。
 *
 * ## 它为什么不是 hero card
 *
 * 它没有大号数字、没有渐变、没有营销标题、没有装饰。它是一条被钉住的
 * 单行问题 + 一条 2px 横线。它的视觉重量刻意低于其下的链条——
 * 上下文不该和内容抢注意力，它只需要**一直在**。
 */

import { messages } from "@/lib/i18n"

const t = messages.research.question

export function AnchoredQuestion({ text }: { text: string }) {
  return (
    <section className="rs-question" aria-labelledby="rs-anchored-question">
      <p className="rs-section-label">
        <span aria-hidden className="rs-section-label__tick" />
        {t.label}
      </p>
      <div className="rs-question__row">
        <span aria-hidden className="rs-question__index">
          Q
        </span>
        <h2 id="rs-anchored-question" className="rs-question__text">
          {text}
        </h2>
      </div>
    </section>
  )
}
