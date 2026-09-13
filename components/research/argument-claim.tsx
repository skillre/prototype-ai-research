"use client"

/**
 * Argument Claim —— 论证链上的一条论断，连同直接附着于它的原文。
 *
 * ## 它为什么不是一张卡片
 *
 * 卡片网格会把链条拆成互不相干的块，而这一屏要读的是「一条接一条」。
 * 所以这里是一条**连续的行**：左侧一个刻度列（index column），右侧是论断
 * 与它的证据。claim 之间的分隔是一条 hairline，不是一圈圆角边框 + 阴影。
 *
 * ## 它怎么处理「反驳」
 *
 * 反驳的可访问语义**不能靠视觉**。契约给 `contradicts` 配了一句
 * `claimAnnouncement`（「本条存在反驳证据」），因为「逆流位置」是一个纯视觉
 * 信号——屏幕阅读器用户拿不到它。所以只要这条论断带着反驳证据，
 * 这句话就必须出现在 DOM 里（视觉上隐藏、无障碍树里存在）。
 *
 * ## 它怎么处理「太多证据」
 *
 * 390px 下一条论断可以带四条证据。默认只显示前 3 条（由 `evidenceWindow`
 * 按**契约顺序**切），其余折进「还有 N 条」。切法不做任何 stance 特判——
 * 契约说反驳最先，那折叠时就必须先保住它。
 *
 * ## 展开态只有一份
 *
 * `openLinkId` 由本组件持有，子组件是受控的。这样「同时只展开一条原文」
 * 这条规则只有一个实现——如果每个证据各自持有 `open`，那条规则就得靠
 * 调用方在回调里倒推，而倒推迟早会写错。
 */

import { useState } from "react"
import { StructureReveal } from "@/lib/kits/adapters/structure"
import { messages } from "@/lib/i18n"
import { evidenceWindow, type ClaimProjection } from "@/lib/research-ui"
import { EvidencePassage } from "./evidence-passage"
import { UnsupportedGap } from "./unsupported-gap"

const t = messages.research.chain
const te = messages.research.evidence
const tk = messages.research.rail

/** 依据状态 → 界面词。键是 domain 的 `ClaimBasisStatus`，不是重写的分支。 */
const BASIS_LABEL = {
  unsupported: t.basis.unsupported,
  supported: t.basis.supported,
  contested: t.basis.contested,
  invalidated: t.basis.invalidated,
} as const

/** 依据状态 → 视觉修饰。修饰是**形状**（实心条 / 断裂条 / 删除线），不只是颜色。 */
const BASIS_TONE = {
  unsupported: "unsupported",
  supported: "ok",
  contested: "contested",
  invalidated: "invalidated",
} as const

export function ArgumentClaim({
  claim,
  suppressedGapClaimId,
  onFocusClaim,
}: {
  claim: ClaimProjection
  /**
   * 哪条论断的缺口已经在移动端首屏卡片里讲过（由 projections 的
   * `primaryGap` 决定）。只有**它**会被窄屏折叠空槽——其余缺口必须留着，
   * 「首屏讲过一条」不等于「其余都不必讲」。 */
  suppressedGapClaimId: string | null
  onFocusClaim: (claimId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [openLinkId, setOpenLinkId] = useState<string | null>(null)

  const { visible, hiddenCount } = evidenceWindow(claim.evidence)
  const shown = expanded ? claim.evidence : visible

  /* 反驳的存在必须在无障碍树上成立。契约只为需要额外播报的 stance
     配了 `claimAnnouncement`，所以这里不需要判断是哪个 stance——
     有这个句子就渲染它，没有就不渲染。 */
  const announcement = claim.evidence.find((item) => item.announcement)?.announcement ?? ""

  return (
    <li
      className="rs-claim"
      data-claim-id={claim.claim.id}
      id={`rs-claim-${claim.claim.id}`}
      /* 这条论断的缺口是否已经在移动端首屏卡片里讲过。
         `true` 只让**窄屏**折叠空槽本体（见 research-shell.css §4）；
         桌面永远完整显示，因为桌面没有那张卡片。 */
      data-gap-suppressed={
        claim.gaps.length > 0 && claim.claim.id === suppressedGapClaimId ? "true" : "false"
      }
      data-flag-count={String(claim.flags.length)}
    >
      {/* 刻度列：纯装饰的空 span，内部没有任何文本节点，
          因此 aria-hidden 在这里不会剪掉任何真内容。 */}
      <span aria-hidden className="rs-claim__scale" />

      <div className="rs-claim__body">
        <div className="rs-claim__head">
          <span className="rs-claim__index">{t.claimLabel(claim.index)}</span>
          <p className="rs-claim__status">
            <span className={`rs-readout kits-label rs-readout--${BASIS_TONE[claim.basisStatus]}`}>
              {BASIS_LABEL[claim.basisStatus]}
            </span>
            <span className="rs-readout kits-label">
              {claim.evidence.length > 0 ? t.citations(claim.evidence.length) : t.noCitations}
            </span>
          </p>
        </div>

        <h3 className="rs-claim__text">{claim.claim.text}</h3>

        {announcement ? (
          <p className="rs-visually-hidden" data-contradiction-announcement="">
            {announcement}
          </p>
        ) : null}

        {/* 空槽。**只有** `gaps` 里的缺口会走到这里——它们是
            「那一栏真的是空的」（无证据支撑 / 引用已失效），
            由 projections 分流，不是组件判断的。 */}
        {claim.gaps.length > 0 ? (
          <UnsupportedGap
            gap={claim.gaps[0]}
            claimText={claim.claim.text}
            onFocusClaim={() => onFocusClaim(claim.claim.id)}
          />
        ) : null}

        {/* 标记：张力说「已有证据但不够强」时走这条通道（有反驳 / 单一来源 /
            来源质量偏低）。它们不该画成空槽——那一栏有内容。 */}
        {claim.flags.length > 0 ? (
          <p className="rs-claim__flags">
            {claim.flags.map((kind) => (
              <span key={kind} className="rs-claim__flag kits-label" data-tension-kind={kind}>
                {tk.kind[kind]}
              </span>
            ))}
          </p>
        ) : null}

        {claim.evidence.length > 0 ? (
          /* 签名组件 1/2：整条论断按阅读顺序落定。
             step="one" 而不是 "group"——逐条揭示会让链条变成「一行一行蹦出来」，
             而这里要的是「这一环已经就位」，不是一个播放列表。 */
          <StructureReveal as="ul" step="one" shift="subtle" className="rs-evidence">
            {shown.map((item) => (
              <EvidencePassage
                key={item.linkId}
                evidence={item}
                open={openLinkId === item.linkId}
                onToggle={(open) => setOpenLinkId(open ? item.linkId : null)}
              />
            ))}
          </StructureReveal>
        ) : null}

        {hiddenCount > 0 ? (
          <button
            type="button"
            className="rs-action rs-action--quiet kits-control rs-evidence__more"
            aria-expanded={expanded}
            data-testid={`evidence-more-${claim.claim.id}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? te.less : te.more(hiddenCount)}
          </button>
        ) : null}
      </div>
    </li>
  )
}
