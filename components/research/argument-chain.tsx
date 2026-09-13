"use client"

/**
 * Argument Chain —— 第一屏的主体。
 *
 * ```
 *   ┌──────────────────────────────┬───────────────┐
 *   │  Argument Spine   ~78%        │  Tension Rail │
 *   │                               │  24rem        │
 *   │  分组标题（子问题）             │               │
 *   │   论断 1 + 证据                │  未处理        │
 *   │   论断 2 + **虚线空槽**  ←主角  │   无证据支撑   │
 *   │   论断 3 + 证据                │   存在反驳     │
 *   │   …                            │  已闭合 1 项   │
 *   └──────────────────────────────┴───────────────┘
 * ```
 *
 * ## 一屏一个光源
 *
 * 本屏的光源是**缺口本身**。所以没有任何 glow、没有渐变、没有 ambient。
 * 把 `--ambient-*` / `--hero-*` / `--chart-glow` 全部中和掉的正是
 * `research-shell.css`，而这里之所以还敢用 `.rs-shell` 的暗色，
 * 是因为暗色做在 token 层而不是组件层（见该文件 §2）。
 *
 * ## DataCursor 用在哪、为什么只在那
 *
 * 签名组件 2/2，只覆盖**证据区域**（含窄带），不覆盖整页。
 * 它的用途是「不离开上下文就知道 locator / 来源 / 片段身份」，
 * 所以只挂在有 locator 的地方。也不做装饰性 cursor trail。
 *
 * 触屏与 reduced-motion 下它自己会关掉——`useFinePointer()` +
 * `useMotionAllowed()` 是组件的内建降级，产品**不需要也不应该**自己写
 * `matchMedia` 分支（见 react-utils 的 contract.ts）。
 *
 * ## 只消费契约
 *
 * 本文件里没有一次 `stance === "…"`。顺序由 `projection.evidence` 决定
 * （它按契约的 `order` 排好），形状由 `presentation.form` 决定（走 `data-form`），
 * 词由 `presentation.label` 决定。这就是「关系契约是唯一入口」的样子。
 */

import { useState } from "react"
import { StructureReveal } from "@/lib/kits/adapters/structure"
import { Pointer } from "@/lib/kits/adapters/pointer"
import { messages } from "@/lib/i18n"
import type { DispositionIssue, TensionResolution } from "@/lib/research"
import type { ArgumentChain as ArgumentChainData } from "@/lib/research-ui"
import { ArgumentClaim } from "./argument-claim"
import { ReviewerNoteCard, type ReviewerDecision } from "./reviewer-note"
import { GapBody } from "./unsupported-gap"
import { TensionRail, TensionRailDock } from "./tension-rail"

const t = messages.research.chain
const tg = messages.research.gap

export function ArgumentChain({
  chain,
  onSubmitDisposition,
  onReviewerDecision,
}: {
  chain: ArgumentChainData
  onSubmitDisposition: (
    tensionId: string,
    resolution: TensionResolution,
    reason: string,
  ) => { ok: true } | { ok: false; issues: DispositionIssue[] }
  onReviewerDecision: (
    noteId: string,
    decision: ReviewerDecision,
    reason: string,
  ) => { ok: true } | { ok: false; issues: DispositionIssue[] }
}) {
  /* 被 rail 指到的论断。它是**界面状态**，不是数据——所以它活在这里，
     不进 domain，也不进 projection。 */
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null)

  /* 哪一个缺口的处置面板开着，以及**开在哪个位置**。
     状态放在这里而不是留在 rail 里，是因为**两个入口**都要打开它：
     未处理清单里的「处理」，以及审稿意见里的「处理这个缺口」。
     状态留在 rail 里的话，那两个入口会各开一份互不相知的副本，
     于是点了审稿意见上的按钮看起来什么都没发生。

     `placement` 是必需的，不是优化：桌面窄带与移动抽屉都会渲染
     `DispositionPanel`，而其中的一个在给定视口下是 `display:none`。
     不区分位置就会同时渲染两份表单——而抽屉那一份还会**运行模态副作用**
     （抢焦点、记录归还目标），即使它根本不可见。一个看不见的模态
     不该执行模态的副作用。 */
  const [disposition, setDisposition] = useState<{
    tensionId: string
    placement: "rail" | "sheet"
  } | null>(null)

  const openDisposition = (tensionId: string, from?: "rail" | "sheet") => {
    /* 没指定来源时按当前视口决定。这次 `matchMedia` **在点击时读**，
       不在渲染时读——所以它不可能造成 hydration 不一致。
       （Kits 组件的契约禁止产品自己写 matchMedia 分支，因为那是组件该内建的
       降级；这里不是降级，是把一次用户动作路由到当前存在的那个容器。） */
    const placement =
      from ?? (window.matchMedia("(min-width: 1024px)").matches ? "rail" : "sheet")
    setDisposition({ tensionId, placement })
    if (placement === "rail") {
      /* 从链条上的审稿意见点进来时，视口可能看不到 rail
         ——先把那一条滚进视野，否则用户会以为按钮坏了。 */
      document
        .querySelector(`.rs-rail__row[data-tension-id="${tensionId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }
  const closeDisposition = () => setDisposition(null)
  const railPanelId = disposition?.placement === "rail" ? disposition.tensionId : null
  const sheetPanelId = disposition?.placement === "sheet" ? disposition.tensionId : null

  const focusClaim = (claimId: string) => {
    setFocusedClaimId(claimId)
    document.getElementById(`rs-claim-${claimId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  }

  return (
    <div className="rs-body">
      {/* 整条链条走一次 InsightReveal：签名组件 1/2。
          它是**块级**揭示——链条按阅读顺序落定，而不是每个小元素各自跳一下。
          同屏 signature budget 用满即止（2 个），没有第三个。 */}
      <div className="rs-spine">
        <p className="rs-section-label">
          <span aria-hidden className="rs-section-label__tick" />
          {t.label}
        </p>

        {/* 缺口的「第一屏卡片」。
            它在**桌面与移动端都存在**，位置也一样：论证链的开头。
            firstVisual 说的是「断点成为第一视觉焦点」，不是「移动端才看得到」。

            它比链条里的空槽多两样东西：论断原文（读者还没有上下文），
            以及一个把读者送进链条的行动。

            注意这里**不**再单独渲染一次「断点」标签——`GapBody` 的虚线空槽里
            已经带着它。第一版两处都写了，页面上于是出现两个「断点」，
            而且空槽自己少了一个标签（截图里能直接看到）。 */}
        {chain.primaryGap ? (
          <div className="rs-gap-lead" data-testid="primary-gap-lead">
            <GapBody
              gap={chain.primaryGap.gap}
              claimText={chain.primaryGap.claim.claim.text}
              primary
            />
            <div className="rs-gap__actions">
              <button
                type="button"
                className="rs-action kits-control"
                data-testid="gap-lead-focus"
                onClick={() => focusClaim(chain.primaryGap!.claim.claim.id)}
              >
                {tg.focusAction}
              </button>
            </div>
          </div>
        ) : null}

        {/* DataCursor 覆盖链条里**有 locator** 的那一片。 */}
        <Pointer mode="crosshair" className="rs-spine__cursor">
          <StructureReveal as="div" step="one" shift="medium" className="rs-spine__reveal">
            {chain.groups.map((group) => (
              <section
                key={group.question.id}
                className={`rs-group${group.isRoot ? " rs-group--root" : ""}`}
                /* 每一组都必须有一个可访问名——统一用 `aria-labelledby` 指向它自己的
                   标题，而不是两者混用：同时给 `aria-label` 与 `aria-labelledby` 时
                   后者优先，前者被**静默忽略**，那是最难发现的一类无障碍 bug。
                   主问题那一组的标题是**视觉隐藏**的：那句话已经钉在页面顶端，
                   在链条里再写一遍就是把同一句话在同一屏上说两遍；
                   但「这一组直接回答研究问题」对读屏用户是真实的分组信息。 */
                aria-labelledby={`rs-group-${group.question.id}`}
              >
                {group.isRoot ? (
                  <p className="rs-visually-hidden" id={`rs-group-${group.question.id}`}>
                    {t.rootGroupLabel}
                  </p>
                ) : (
                  <div className="rs-group__head">
                    <p className="rs-section-label">{t.subQuestionLabel}</p>
                    <h2 id={`rs-group-${group.question.id}`} className="rs-group__question">
                      {group.question.text}
                    </h2>
                  </div>
                )}
                <ol className="rs-group__claims">
                  {group.claims.map((claim) => (
                    <ArgumentClaim
                      key={claim.claim.id}
                      claim={claim}
                      suppressedGapClaimId={chain.primaryGap?.claim.claim.id ?? null}
                      onFocusClaim={focusClaim}
                      onReviewerDecision={onReviewerDecision}
                      onOpenDisposition={(tensionId) => openDisposition(tensionId)}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </StructureReveal>
        </Pointer>
      </div>

      {/* 桌面窄带。 */}
      <TensionRail
        chain={chain}
        onGoToClaim={focusClaim}
        onSubmit={onSubmitDisposition}
        openPanelId={railPanelId}
        onOpenPanel={(tensionId) => openDisposition(tensionId, "rail")}
        onClosePanel={closeDisposition}
      />

      {/* 移动端底部清单。桌面不渲染（CSS 隐藏，且里面没有可聚焦元素被藏起来
          ——关闭态是条件渲染，不是 CSS 藏）。 */}
      <TensionRailDock
        chain={chain}
        onGoToClaim={focusClaim}
        onSubmit={onSubmitDisposition}
        openPanelId={sheetPanelId}
        onOpenPanel={(tensionId) => openDisposition(tensionId, "sheet")}
        onClosePanel={closeDisposition}
      />

      {/* ---- Class 3 建议 + 历史投影 ----
          刻意放在**链条之外、窄带之外**的底部：建议按契约没有靶心，
          把它塞进某条论断下面就是伪造一个靶心。放在这里它仍然是「审稿意见」，
          只是不属于任何一环。 */}
      {chain.reviewer.suggestions.length > 0 || chain.reviewer.rejected.length > 0 ? (
        <section className="rs-review-tail" aria-labelledby="rs-review-tail-heading">
          <h2 id="rs-review-tail-heading" className="rs-section-label">
            <span aria-hidden className="rs-section-label__tick" />
            {messages.research.reviewer.suggestionTitle}
          </h2>

          {chain.reviewer.suggestions.map((note) => (
            <ReviewerNoteCard
              key={note.id}
              note={note}
              onDecide={onReviewerDecision}
              onOpenDisposition={(tensionId) => openDisposition(tensionId)}
            />
          ))}

          {chain.reviewer.rejected.length > 0 ? (
            <>
              <p className="rs-review-tail__note" data-testid="rejected-outputs-note">
                {messages.research.reviewer.rejectedNote}
              </p>
              {chain.reviewer.rejected.map((note) => (
                <ReviewerNoteCard
                  key={note.id}
                  note={note}
                  onDecide={onReviewerDecision}
                  onOpenDisposition={(tensionId) => openDisposition(tensionId)}
                />
              ))}
            </>
          ) : null}
        </section>
      ) : null}

      {/* 被指到的论断高亮：用 `data-*` 属性表达，由 CSS 上色。
          用一个空的镜像元素把状态放到 DOM 上，是为了让断言有东西可读——
          它不含文本，也不含可聚焦元素。 */}
      <span className="rs-visually-hidden" data-focused-claim={focusedClaimId ?? ""} />
      <span className="rs-visually-hidden" data-open-tensions={String(chain.openTensions.length)} />
    </div>
  )
}
