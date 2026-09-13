/**
 * Running Head —— 第一行。
 *
 * ## 它不是什么
 *
 * 不是 TopNav，不是 SaaS header。没有品牌区、没有导航项、没有账户菜单、
 * 没有主题开关。那些都是**外壳**的语言：它们回答「我在哪个产品里」，
 * 而这一屏要回答的是「我在哪个论证的哪一环」。
 *
 * ## 它是什么
 *
 * 一行、1px 横线、极弱层级：工作代号 · 研究者 · 范围摘要 · 未处理张力数。
 * 它的全部职责是让「上一句话在说什么」永远可见，然后把自己让开。
 *
 * 因此它是 Server Component —— 它没有任何交互，也不该有。
 */

import { messages } from "@/lib/i18n"
import type { ResearchAnchor } from "@/lib/research-ui"

const t = messages.research.head

export function ResearchRunningHead({ anchor }: { anchor: ResearchAnchor }) {
  const hasOpen = anchor.openTensionCount > 0

  return (
    <header className="rs-running-head">
      <div className="rs-running-head__inner">
        <div className="rs-running-head__group">
          <h1 className="rs-running-head__codename">{anchor.codename}</h1>

          <div className="rs-running-head__scope">
            {/* 范围是**显式边界**——「不做什么」写下来才有价值，
                所以 out 也被渲染出来，而且和 in 一样可见。
                它不是一个 tooltip，也不是一个被折叠的次要信息。 */}
            {anchor.scopeIn.map((item) => (
              <span key={item} className="rs-running-head__scope-item kits-label">
                {item}
              </span>
            ))}
            <span aria-hidden className="rs-running-head__scope-item kits-label">
              /
            </span>
            {anchor.scopeOut.map((item) => (
              <span key={item} className="rs-running-head__scope-item kits-label" data-excluded="true">
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* 未处理张力数。它是这一屏唯一的「计数」——而且它数的不是业绩，
            是**还没解决的问题**。视觉上刻意做得比正文弱：一个读数，
            不是一个 KPI。 */}
        <p className={`rs-tally kits-label${hasOpen ? "" : " rs-tally--empty"}`}>
          <span>{t.openTensions}</span>
          <span className="numeric">
            {hasOpen ? anchor.openTensionCount : t.openTensionsNone}
          </span>
          {hasOpen ? <span>{t.openTensionsUnit}</span> : null}
        </p>
      </div>
    </header>
  )
}
