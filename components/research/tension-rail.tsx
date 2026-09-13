"use client"

/**
 * Tension Rail —— 右侧窄带 / 移动端底部清单。
 *
 * ## 三个处置状态，三段，三套样子（Phase E 的核心）
 *
 * ```
 * 未处理      ◆ 无证据支撑      阻断 · 论断 2      [定位] [处理]
 *             ↑ 有处置入口
 *
 * 已知局限    ◇ 单一来源      洞仍然存在
 *             「这份报告的口径与协会统计一致……」
 *             2026-09-09 接受 · 已接受为已知局限
 *             ↑ **没有**处置入口 —— 它已经是一个决定了
 *
 * 已解决      （只有真的有时才出现）
 * ```
 *
 * 把前两段合成一个「已处理」列表是这一阶段最容易犯、也最致命的错——
 * 那会让「我接受了一个边界」看起来像「我把问题解决了」。
 * 所以它们不仅措辞不同，**结构位置也不同**：已知局限带理由和日期，
 * 已解决只是一条被划掉的事实。
 *
 * ## 为什么 rail item 不再是单个按钮
 *
 * Phase D 里每条是一个 `<button>`。Phase E 要加处置入口——
 * 而**按钮不能嵌套按钮**（非法 HTML，且会让聚焦行为无法预测）。
 * 所以现在是一个 `<li>` 容器，里面两个各自独立的可聚焦控件：
 *
 * ```
 * [定位到这条论断]   ← 主体，仍然保留原来的行为
 * [处理]             ← Phase E 新增
 * ```
 *
 * 两者都有明确的可访问名，Tab 顺序就是 DOM 顺序。
 */

import { useState } from "react"
import { messages } from "@/lib/i18n"
import type { DispositionIssue, KnownLimitation, TensionResolution } from "@/lib/research"
import type { ArgumentChain } from "@/lib/research-ui"
import { BottomSheet, SHEET_TITLE_ID } from "./bottom-sheet"
import { DispositionPanel } from "./disposition-panel"

const t = messages.research.rail
const td = messages.research.disposition

type Submit = (
  tensionId: string,
  resolution: TensionResolution,
  reason: string,
) => { ok: true } | { ok: false; issues: DispositionIssue[] }

const KIND_LABEL = t.kind
const SEVERITY_LABEL = t.severity

/** 已知局限条目。**没有处置入口**——它已经是一个决定，不是一个待办。 */
function LimitationItem({
  limitation,
  onGoToClaim,
}: {
  limitation: KnownLimitation
  onGoToClaim: (claimId: string) => void
}) {
  return (
    <li className="rs-rail__limitation" data-limitation-id={limitation.tensionId}>
      <p className="rs-rail__limitation-head">
        <span aria-hidden className="rs-rail__limitation-mark" />
        <span className="rs-rail__kind">{KIND_LABEL[limitation.kind]}</span>
        <span className="rs-rail__meta">{t.stateAccepted}</span>
      </p>
      {/* 人写下的那句话。它是这一段的全部价值——交付物里要用的就是它。 */}
      <p className="rs-rail__limitation-reason">{limitation.reason}</p>
      <p className="rs-rail__limitation-meta">
        <span>{td.acceptedAt(limitation.acceptedAt.slice(0, 10))}</span>
        <span aria-hidden>·</span>
        {/* 事实是否仍然存在。**这一行是 accepted-as-limitation 的定义**：
            洞还在，我带着它交付。事实后来被填上时它会变成「历史记录」。 */}
        <span data-testid={`limitation-raised-${limitation.tensionId}`}>
          {limitation.stillRaised ? td.stillRaised : td.noLongerRaised}
        </span>
      </p>
      <button
        type="button"
        className="rs-action rs-action--quiet kits-control rs-rail__limitation-goto"
        onClick={() => onGoToClaim(limitation.claimId)}
      >
        {t.goToClaim}
      </button>
    </li>
  )
}

/** 未处理的张力条目：两个独立控件 + 可展开的处置面板。 */
function OpenTensionItem({
  tensionId,
  kind,
  severity,
  claimLabel,
  claimIndex,
  panelOpen,
  onGoToClaim,
  onOpenPanel,
  onClosePanel,
  onSubmit,
  idPrefix,
}: {
  tensionId: string
  kind: keyof typeof KIND_LABEL
  severity: "blocking" | "notable"
  claimLabel: string
  claimIndex: number | undefined
  panelOpen: boolean
  onGoToClaim: () => void
  onOpenPanel: () => void
  onClosePanel: () => void
  onSubmit: Submit
  idPrefix: string
}) {
  return (
    <li
      className="rs-rail__row"
      data-tension-id={tensionId}
      data-tension-kind={kind}
      data-severity={severity}
      data-panel-open={panelOpen ? "true" : "false"}
    >
      <div className="rs-rail__item-actions">
        <button
          type="button"
          className="rs-rail__item rs-rail__item--goto"
          /* 可访问名必须**包含**可见文字（WCAG 2.5.3 Label in Name）：
             所以它把类别、严重度、论断序号都带上，再加动作。 */
          aria-label={`${t.goToClaim}：${KIND_LABEL[kind]}，${SEVERITY_LABEL[severity]}，${claimLabel}`}
          onClick={onGoToClaim}
        >
          <span aria-hidden className="rs-rail__severity" data-severity={severity} />
          <span className="rs-rail__body">
            <span className="rs-rail__kind">{KIND_LABEL[kind]}</span>
            <span className="rs-rail__meta">
              <span>{SEVERITY_LABEL[severity]}</span>
              <span aria-hidden>·</span>
              <span>{claimLabel}</span>
            </span>
          </span>
        </button>

        {/* 独立的处置入口。它与上面那个按钮是兄弟，不是子节点。 */}
        <button
          type="button"
          className="rs-action rs-rail__dispose kits-control"
          aria-expanded={panelOpen}
          data-testid={`dispose-${tensionId}`}
          onClick={panelOpen ? onClosePanel : onOpenPanel}
        >
          {td.action}
        </button>
      </div>

      {panelOpen ? (
        <DispositionPanel
          idPrefix={idPrefix}
          tensionId={tensionId}
          tensionKind={kind}
          severity={severity}
          claimIndex={claimIndex}
          onSubmit={(resolution, reason) => onSubmit(tensionId, resolution, reason)}
          onClose={onClosePanel}
        />
      ) : null}
    </li>
  )
}

/** 桌面与移动端共用的清单内容。 */
function TensionRailList({
  chain,
  openPanelId,
  onGoToClaim,
  onOpenPanel,
  onClosePanel,
  onSubmit,
  idPrefix,
}: {
  chain: ArgumentChain
  openPanelId: string | null
  onGoToClaim: (claimId: string) => void
  onOpenPanel: (tensionId: string) => void
  onClosePanel: () => void
  onSubmit: Submit
  idPrefix: string
}) {
  return (
    <>
      {chain.openTensions.length === 0 ? (
        <p className="rs-rail__empty kits-label">{t.empty}</p>
      ) : (
        <ul className="rs-rail__list" aria-label={t.label}>
          {chain.openTensions.map((tension) => {
            const claimId = tension.subject.claimId
            const index = chain.claimIndex.get(claimId)
            const claimLabel = index ? t.subjectClaim(index) : claimId
            return (
              <OpenTensionItem
                key={tension.id}
                tensionId={tension.id}
                kind={tension.kind}
                severity={tension.severity}
                claimLabel={claimLabel}
                claimIndex={index}
                panelOpen={openPanelId === tension.id}
                onGoToClaim={() => onGoToClaim(claimId)}
                onOpenPanel={() => onOpenPanel(tension.id)}
                onClosePanel={onClosePanel}
                onSubmit={onSubmit}
                idPrefix={idPrefix}
              />
            )
          })}
        </ul>
      )}

      {/* ---- 已知局限：与未处理**分开的一段**，没有处置入口 ---- */}
      {chain.limitations.length > 0 ? (
        <>
          <p className="rs-rail__group-head" id={`${idPrefix}-limitations`}>
            <span className="rs-section-label">{t.limitationsLabel}</span>
            <span className="kits-label numeric">{t.limitationsCount(chain.limitations.length)}</span>
          </p>
          <ul className="rs-rail__list" aria-labelledby={`${idPrefix}-limitations`}>
            {chain.limitations.map((limitation) => (
              <LimitationItem
                key={limitation.tensionId}
                limitation={limitation}
                onGoToClaim={onGoToClaim}
              />
            ))}
          </ul>
        </>
      ) : null}

      {/* ---- 已解决：只在真的有的时候出现 ---- */}
      {chain.resolvedTensions.length > 0 ? (
        <>
          <p className="rs-rail__group-head" id={`${idPrefix}-resolved`}>
            <span className="rs-section-label">{t.resolvedLabel}</span>
            <span className="kits-label numeric">{t.resolvedCount(chain.resolvedTensions.length)}</span>
          </p>
          <ul className="rs-rail__list" aria-labelledby={`${idPrefix}-resolved`}>
            {chain.resolvedTensions.map((tension) => {
              const index = chain.claimIndex.get(tension.subject.claimId)
              return (
                <li key={tension.id} className="rs-rail__resolved" data-resolved-id={tension.id}>
                  <span className="rs-rail__resolved-text">
                    {tension.kind in KIND_LABEL ? KIND_LABEL[tension.kind as keyof typeof KIND_LABEL] : tension.kind}
                  </span>
                  {index ? <span className="rs-rail__meta">{t.subjectClaim(index)}</span> : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}

/** 桌面右侧窄带。 */
export function TensionRail({
  chain,
  onGoToClaim,
  onSubmit,
  openPanelId,
  onOpenPanel,
  onClosePanel,
}: {
  chain: ArgumentChain
  onGoToClaim: (claimId: string) => void
  onSubmit: Submit
  /** 哪一个条目的处置面板开着。**状态在 ArgumentChain 上**——
   *  因为审稿意见也能打开它（见 reviewer-note 的 derivedAction），
   *  如果状态留在这里，那两个入口就会各开一份互不相知的副本。 */
  openPanelId: string | null
  onOpenPanel: (tensionId: string) => void
  onClosePanel: () => void
}) {
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

        <TensionRailList
          chain={chain}
          openPanelId={openPanelId}
          onGoToClaim={onGoToClaim}
          onOpenPanel={onOpenPanel}
          onClosePanel={onClosePanel}
          onSubmit={onSubmit}
          idPrefix="rs-rail-inline"
        />
      </div>
    </aside>
  )
}

/**
 * 移动端底部清单。
 *
 * 两层抽屉：外层是张力清单（Phase D 已有），点「处理」再开一层处置抽屉。
 * 两层都不挤压首屏——这是 fold gate 的要求。
 */
export function TensionRailDock({
  chain,
  onGoToClaim,
  onSubmit,
  openPanelId,
  onOpenPanel,
  onClosePanel,
}: {
  chain: ArgumentChain
  onGoToClaim: (claimId: string) => void
  onSubmit: Submit
  openPanelId: string | null
  onOpenPanel: (tensionId: string) => void
  onClosePanel: () => void
}) {
  const [listOpen, setListOpen] = useState(false)

  const panelTension = chain.openTensions.find((tension) => tension.id === openPanelId)
  const panelIndex = panelTension ? chain.claimIndex.get(panelTension.subject.claimId) : undefined

  return (
    <div className="rs-rail-dock" data-testid="tension-dock">
      <button
        type="button"
        className="rs-rail-dock__toggle"
        aria-expanded={listOpen}
        aria-controls="rs-rail-dock-panel"
        onClick={() => setListOpen((value) => !value)}
      >
        <span className="rs-section-label">
          <span aria-hidden className="rs-section-label__tick" />
          {t.label}
        </span>
        <span className="kits-label numeric">
          {t.openCount(chain.openTensions.length)} · {listOpen ? t.close : t.open}
        </span>
      </button>

      {/* 关闭时这些按钮**不在文档里**（条件渲染，不是 CSS 藏）。 */}
      {listOpen ? (
        <div id="rs-rail-dock-panel" className="rs-rail-dock__panel">
          <TensionRailList
            chain={chain}
            openPanelId={openPanelId}
            onGoToClaim={(claimId) => {
              onGoToClaim(claimId)
              setListOpen(false)
            }}
            onOpenPanel={onOpenPanel}
            onClosePanel={onClosePanel}
            onSubmit={onSubmit}
            idPrefix="rs-rail-dock"
          />
        </div>
      ) : null}

      {/* 处置抽屉。条件渲染 + 模态：关闭时它不留在可聚焦树里。 */}
      {panelTension ? (
        <BottomSheet labelId={SHEET_TITLE_ID} title={td.panelTitle} onClose={onClosePanel}>
          <DispositionPanel
            idPrefix="rs-sheet"
            showTitle={false}
            tensionId={panelTension.id}
            tensionKind={panelTension.kind}
            severity={panelTension.severity}
            claimIndex={panelIndex}
            onSubmit={(resolution, reason) => onSubmit(panelTension.id, resolution, reason)}
            onClose={onClosePanel}
          />
        </BottomSheet>
      ) : null}
    </div>
  )
}
