"use client"

/**
 * Tension Rail —— 右侧窄带 / 移动端底部清单。
 *
 * ## 它只放一件东西
 *
 * **未处理的**张力。已处置的（resolved / accepted-as-limitation）不出现在
 * 主 rail 里——rail 的职责是「还有什么没处理」，把已闭合的塞进去会让它
 * 立刻退化成一条什么都有的日志，然后人就再也不看它了。
 *
 * 已闭合的数量在底部留一句话（`已闭合 N 项`），trace 抽屉本阶段不实现。
 *
 * ## 它为什么不是一个清单页
 *
 * 它是**窄带**：宽度固定、条目一行行排、每条只有一个 kind 词 + 落在哪条论断上。
 * 没有详情、没有操作、没有状态徽章——本阶段不做 disposition。
 * 点击只做一件事：把对应的论断滚进视野并标记它。
 *
 * ## 两种形态，一份数据
 *
 * 桌面（≥1024px）是并排的一栏，sticky 跟随。窄屏是底部抽屉。
 * 两者渲染的是**同一个** `TensionRailList`——本阶段抽屉的交互很简单
 * （开 / 关 / 列表 / 滚到论断），因此不需要把内容复制一份到浮层里，
 * 那样只会多出一处需要同步的地方。
 */

import { useState } from "react"
import { messages } from "@/lib/i18n"
import type { ArgumentChain } from "@/lib/research-ui"

const t = messages.research.rail

/** kind → 界面词。键是 domain 的 `TensionKind`，不是重写的一套枚举。 */
const KIND_LABEL = t.kind
const SEVERITY_LABEL = t.severity

export function TensionRailList({
  chain,
  onGoToClaim,
}: {
  chain: ArgumentChain
  onGoToClaim: (claimId: string) => void
}) {
  if (chain.openTensions.length === 0) {
    return <p className="rs-rail__empty kits-label">{t.empty}</p>
  }

  return (
    <ul className="rs-rail__list">
      {chain.openTensions.map((tension) => {
        const claimId = tension.subject.claimId
        const index = chain.claimIndex.get(claimId)
        const label = index ? t.subjectClaim(index) : claimId
        return (
          <li key={tension.id}>
            {/* 真实按钮：滚动并把论断标记为「刚被指到」。
                这里**没有**处置入口——那是 Phase E。 */}
            <button
              type="button"
              className="rs-rail__item"
              data-tension-id={tension.id}
              data-tension-kind={tension.kind}
              data-severity={tension.severity}
              onClick={() => onGoToClaim(claimId)}
            >
              <span aria-hidden className="rs-rail__severity" data-severity={tension.severity} />
              <span className="rs-rail__body">
                <span className="rs-rail__kind">{KIND_LABEL[tension.kind]}</span>
                <span className="rs-rail__meta">
                  <span>{SEVERITY_LABEL[tension.severity]}</span>
                  <span aria-hidden>·</span>
                  <span>{label}</span>
                  <span aria-hidden>·</span>
                  <span>{t.goToClaim}</span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 桌面右侧窄带。 */
export function TensionRail({ chain, onGoToClaim }: { chain: ArgumentChain; onGoToClaim: (claimId: string) => void }) {
  return (
    <aside className="rs-rail-desktop" aria-labelledby="rs-rail-heading">
      <div className="rs-rail">
        <div className="rs-rail__head">
          <h2 id="rs-rail-heading" className="rs-section-label">
            <span aria-hidden className="rs-section-label__tick" />
            {t.label}
          </h2>
          <span className="kits-label numeric">{t.openCount(chain.openTensions.length)}</span>
        </div>

        <TensionRailList chain={chain} onGoToClaim={onGoToClaim} />

        {chain.closedTensions.length > 0 ? (
          <p className="rs-rail__foot kits-label">
            <span>{t.closedSummary(chain.closedTensions.length)}</span>
            <span aria-hidden>·</span>
            <span>{t.closedTraceHint}</span>
          </p>
        ) : null}
      </div>
    </aside>
  )
}

/** 移动端底部清单：开 / 关 / 列表 / 滚到论断。 */
export function TensionRailDock({
  chain,
  onGoToClaim,
}: {
  chain: ArgumentChain
  onGoToClaim: (claimId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rs-rail-dock" data-testid="tension-dock">
      <button
        type="button"
        className="rs-rail-dock__toggle"
        aria-expanded={open}
        aria-controls="rs-rail-dock-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="rs-section-label">
          <span aria-hidden className="rs-section-label__tick" />
          {t.label}
        </span>
        <span className="kits-label numeric">
          {t.openCount(chain.openTensions.length)} · {open ? t.close : t.open}
        </span>
      </button>

      {/* 条件渲染而不是 CSS 隐藏：关闭时这些按钮**不在文档里**。
          用 CSS 藏起来的话，它们仍然可聚焦——那才是「看得见的内容被藏了」
          的反面：看不见的内容还能被 Tab 到。 */}
      {open ? (
        <div id="rs-rail-dock-panel" className="rs-rail-dock__panel">
          <TensionRailList
            chain={chain}
            onGoToClaim={(claimId) => {
              onGoToClaim(claimId)
              setOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
