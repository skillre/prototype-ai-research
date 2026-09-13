/**
 * 缺口（Unsupported Gap）—— 本屏的视觉主角。
 *
 * ## 它为什么是主角
 *
 * 研究者最大的失败模式不是漏了资料，是**没注意到自己的论证有个洞**。
 * 所以他正是那个不会主动去看「缺口清单」的人。缺口必须挡在他读链条的路上。
 *
 * ## 它凭什么抢眼
 *
 * 不是 glow，不是红色警告大卡片，不是巨大图标——那些都是**加了东西**。
 * 这里做的是**减东西**：本该有证据的那一栏是空的，空槽用虚线勾出形状。
 * 周围全是 1px 实线，只有它是虚线；周围都有内容，只有它是空的。
 * 「这里没有东西」本身就是对比度。
 *
 * ## 它只说它真的是的那件事
 *
 * 第一版把**所有**未处理张力都渲染成「尚无证据支撑」。后果很具体：
 * `clm-yield-advantage` 有四条证据（反驳 / 支持 ×2 / 背景），
 * 却在它们上面挂了一个「断点 · 尚无证据支撑」——两条陈述互相否认。
 *
 * 所以现在只有 `MissingEvidenceKind`（`unsupported-claim` / `stale-source`）
 * 会走到这里，而且**空槽的理由由 kind 决定**：没有证据 ≠ 证据失效。
 * 其余三种张力在论断上打标记，不画空槽。
 *
 * ## 它明确不做什么
 *
 * 不实现处置流程（resolve / accept-as-limitation）。那是 Phase E。
 * 这里的按钮只做一件事：把这条论断带回视野。
 */

import { messages } from "@/lib/i18n"
import type { ClaimGap, MissingEvidenceKind } from "@/lib/research-ui"

const t = messages.research.gap

/** 「这一栏为什么是空的」。键是 `MissingEvidenceKind`——加一种就会编译失败。 */
const EMPTY_BECAUSE: Record<MissingEvidenceKind, string> = {
  "unsupported-claim": t.emptyBecause.unsupported,
  "stale-source": t.emptyBecause.stale,
}

/**
 * 把「需要哪类材料」编译成规格表的行。
 *
 * 每一行都对应 `ClaimGap.requires` 里的一个字段，**没有一行是组件编的**：
 *   - 一手 / 任何可核对 ← `Claim.kind`（见 lib/research-ui/projections.ts 的表）
 *   - 年份下限         ← 同上
 *   - 属于哪个问题     ← 论断自己的 `questionId`
 */
function requirementRows(gap: ClaimGap): Array<{ label?: string; value: string }> {
  const rows: Array<{ label?: string; value: string }> = [
    {
      label: t.requiresLabel,
      value: gap.requires.sourceType === "primary" ? t.requiresSourceType : t.requiresSourceTypeAny,
    },
    {
      value:
        gap.requires.recencyAfterYear === null
          ? t.requiresRecencyNone
          : t.requiresRecency(gap.requires.recencyAfterYear),
    },
  ]
  if (gap.requires.subject) {
    rows.push({ value: t.requiresSubject(gap.requires.subject) })
  }
  return rows
}

/**
 * 空槽 + 理由 + 材料要求。缺口与「第一屏最大缺口」共用这一个实现——
 * 同一件事有两种画法就会有两种说法，然后它们会漂移。
 */
export function GapBody({
  gap,
  claimText,
  primary = false,
}: {
  gap: ClaimGap
  /** 论断原文。首屏卡片需要它——那里没有链条上下文。 */
  claimText: string
  /** `primary` 是首屏那一张：空槽更高、对比度更高。 */
  primary?: boolean
}) {
  const rows = requirementRows(gap)
  const because = gap.kind in EMPTY_BECAUSE ? EMPTY_BECAUSE[gap.kind as MissingEvidenceKind] : ""

  return (
    <div className={`rs-gap${primary ? " rs-gap--primary" : ""}`}>
      {primary ? <p className="rs-gap-lead__claim">{claimText}</p> : null}

      {/* 空槽：本该有一条证据的位置。
          刻意**不**设为 aria-hidden——视觉上这里是「空」，但在无障碍树里
          它必须是「有」：读屏用户同样需要被告知「此处无证据」。
          （里面也没有可交互元素，所以不会触发 QA 的
          「aria-hidden 祖先含可交互内容」检查——那条针对的是装饰层。） */}
      <div className="rs-gap__slot">
        <span className="rs-gap__break">{t.breakLabel}</span>
        <span className="rs-gap__empty">{t.emptySlot}</span>
        <span className="rs-gap__because">{because}</span>
      </div>

      <ul className="rs-gap__requires">
        {rows.map((row, index) => (
          <li key={index} className="rs-gap__require">
            <span className="rs-gap__require-label">{row.label ?? ""}</span>
            <span className="rs-gap__require-value">{row.value}</span>
          </li>
        ))}
      </ul>

      {gap.questionText ? (
        <p className="rs-gap__question kits-label">{t.answersQuestion(gap.questionText)}</p>
      ) : null}
    </div>
  )
}

/** 链条内的缺口，带一个真实可用的行动。 */
export function UnsupportedGap({
  gap,
  claimText,
  onFocusClaim,
}: {
  gap: ClaimGap
  claimText: string
  /** 由调用方注入——本组件不认识滚动，也不认识 rail。 */
  onFocusClaim: () => void
}) {
  return (
    <div className="rs-gap__actions">
      <GapBody gap={gap} claimText={claimText} />
      {/* 真实可用的按钮：把这条论断带回视野。
          本阶段**不**在这里放处置出口——那是 Phase E。 */}
      <div className="rs-gap__actions">
        <button type="button" className="rs-action kits-control" onClick={onFocusClaim}>
          {t.focusAction}
        </button>
      </div>
    </div>
  )
}
