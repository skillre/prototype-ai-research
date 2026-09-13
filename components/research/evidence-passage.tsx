"use client"

/**
 * Evidence Passage —— 一条证据。原文**直接附着于**论断。
 *
 * ## 它为什么是一个按钮
 *
 * 契约的 `interaction` 通道规定：点击的行为是 `reveal-passage` / `inline`——
 * 就近展开原文，**不跳 route**。离开链条就丢掉「你在哪一环」这个上下文，
 * 而这个上下文正是整个第一屏设计的基础。
 *
 * 所以它必须是一个真实的、可聚焦、可被键盘激活的按钮。
 * 做成 `div` + `onClick` 的话，键盘用户永远打不开原文。
 *
 * ## 形状通道从哪来
 *
 * `data-form` 直接来自 `presentation.form`（契约的四个形状描述词）。
 * 组件**不判断 stance**——它把契约给的字符串放到属性上，由 CSS 按形状渲染。
 * 契约里加一个 stance，这里一行不改。
 *
 * ## 关系不能只靠颜色
 *
 * 灰度截图下仍要能分清四态。做到这一点的是四个**非颜色通道**：
 *   1. 形状（`data-form` → 实线 / 断裂 / 缺角 / 缩进）
 *   2. 词（`presentation.label` 永远显示）
 *   3. 序（`presentation.order`，由 projections 排好，不在 JSX 里手写）
 *   4. 无障碍名（由 `accessibleNameTemplate` 生成，必须以 stance 词开头）
 * 颜色最多做第四层辅助。
 *
 * `rs-evidence__glyph` 里的那个字符是**文字**而不是 CSS `content`：
 * 生成内容在部分辅助技术里不参与朗读，而形状恰恰不能是唯一载体。
 * 它由契约的 `glyph` 通道选中，因此契约换图元时它跟着换。
 */

import { messages } from "@/lib/i18n"
import {
  POINTER_LABEL_ATTRIBUTE,
  POINTER_TARGET_ATTRIBUTE,
  POINTER_TARGET_INSPECT,
} from "@/lib/kits/adapters/pointer"
import type { ClaimEvidence } from "@/lib/research-ui"

const t = messages.research.evidence

/**
 * 契约 `glyph` token → 一个文字字符。
 *
 * 刻意**不是** Lucide 图标名：契约不绑定具体图标库，因此这个映射属于产品。
 * 它按**图元 token** 索引，不按 stance——契约加 stance 时这里也不需要改，
 * 只会因为 token 未覆盖而编译失败（这正是我们想要的失败方式）。
 */
const GLYPH_CHARACTER: Record<ClaimEvidence["presentation"]["glyph"], string> = {
  "counter-mark": "◄",
  "support-mark": "▮",
  "qualifier-mark": "◧",
  "context-mark": "▫",
}

export function EvidencePassage({
  evidence,
  open,
  onToggle,
}: {
  evidence: ClaimEvidence
  /** 受控：展开态由父组件持有，这样「同时只展开一条」只有一个实现。 */
  open: boolean
  onToggle: (open: boolean) => void
}) {
  const { presentation } = evidence

  return (
    <li className="rs-evidence__item">
      <button
        type="button"
        className="rs-evidence__row"
        /* 形状通道。值来自契约的 form 通道，不是组件里的判断。 */
        data-form={presentation.form}
        /* 窄屏标签（`支持 · 第 12 页`）是契约 mobile.labelTemplate 的产物。 */
        data-mobile-label={evidence.mobileLabel}
        data-stance-label={presentation.label}
        /* 来源是否还能核对。失效的引用**仍然显示**（删除线 + 标记），
           因为它是一条真实存在的记录——「我引用过一个现在打不开的来源」
           正是这一屏要让用户看见的东西。 */
        data-source-validity={evidence.source?.validity ?? "missing"}
        data-form-key={`${presentation.form}:${presentation.order}`}
        /* DataCursor 的读数：鼠标停住时不离开上下文就能知道 locator 与来源。 */
        {...{ [POINTER_TARGET_ATTRIBUTE]: POINTER_TARGET_INSPECT }}
        {...{ [POINTER_LABEL_ATTRIBUTE]: evidence.cursorLabel }}
        /* 可访问名由契约模板生成：必须以 stance 词开头。 */
        aria-label={evidence.accessibleName}
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        <span className="rs-evidence__stance">
          <span className="rs-evidence__label">{presentation.label}</span>
          <span
            className="rs-evidence__glyph"
            /* 图元是**辅助**符号；语义由上面的 label 与 a11y 名承担。 */
            aria-hidden
          >
            {GLYPH_CHARACTER[presentation.glyph]}
          </span>
        </span>

        <span className="rs-evidence__body">
          <span className="rs-evidence__text">{evidence.passageText}</span>
          <span className="rs-evidence__meta">
            <span>{evidence.locatorLabel}</span>
            <span aria-hidden>·</span>
            <span>{evidence.sourceTitle || t.sourceMissing}</span>
            {/* 失效的引用必须**说出来**，不能只靠删除线。 */}
            {evidence.source && evidence.source.validity !== "ok" ? (
              <span className="rs-evidence__invalid">{t.sourceInvalid}</span>
            ) : null}
            {/* 展开指示用**文字**，不是旋转箭头——图标不可以是唯一线索。 */}
            <span className="rs-evidence__caret">{open ? t.collapseHint : t.revealHint}</span>
          </span>
        </span>
      </button>

      {open ? (
        /* inline reveal：原文就地展开。它是这个按钮的受控内容，
           `aria-expanded` 已经把它绑上了，不需要第二个可访问名。 */
        <div className="rs-evidence__reveal" data-testid={`evidence-reveal-${evidence.linkId}`}>
          <p className="rs-evidence__reveal-text">{evidence.passageText}</p>
          {evidence.note ? (
            <p className="rs-evidence__note">
              <span className="kits-label">{t.passageLabel}</span> {evidence.note}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
