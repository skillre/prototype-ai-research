/**
 * 词典绑定 —— 把 `lib/i18n` 的文案装配成组装层需要的形状。
 *
 * ## 为什么单独一个文件
 *
 * `lib/research-ui` 的其余部分（`projections.ts` / `reviewer.ts`）是**纯函数、
 * 不读词典**——文案由调用方传进去。那条约束的价值是它们是可测的、
 * 可以在 Node 里直接跑、也不绑定某一种语言。
 *
 * 但总得有人把词典装上去，而且**装配只应该发生一次**：如果组件装一份、
 * 测试再装一份，那么「界面到底显示了什么」就有了两个可能漂移的说法，
 * 而这种漂移不会报错。
 *
 * 所以绑定被放在这个独立模块里，并且**不从 `index.ts` 再导出**——
 * 想用纯层的人 import `@/lib/research-ui`，想用词典的人显式 import
 * `@/lib/research-ui/copy`。这条边界因此是看得见的。
 *
 * 它不依赖 React、不依赖 CSS，所以测试可以直接 import 它。
 */

import { messages } from "@/lib/i18n"
import type { ReviewerCopy } from "./reviewer"

/** 定位文本的格式化函数。属于呈现层，因此由词典提供（见 relation-contract 的说明）。 */
export const RESEARCH_LABELS = {
  page: messages.research.evidence.page,
  anchor: messages.research.evidence.anchor,
  timecode: messages.research.evidence.timecode,
}

/**
 * 审稿意见的文案。
 *
 * 注意 `critiqueText` / `critiqueNext` 是**按张力种类**索引的——
 * 因为机械检查产出的批评，其措辞由「是哪一类问题」决定，
 * 而那一类是领域层算出来的，不是界面猜的。
 */
export const REVIEWER_COPY: ReviewerCopy = {
  critiqueText: messages.research.reviewer.critiqueText,
  critiqueNext: messages.research.reviewer.critiqueNext,
  readingTrap: messages.research.reviewer.readingTrap,
  acknowledgedSuffix: messages.research.reviewer.acknowledgedSuffix,
  rejectedPrefix: messages.research.reviewer.rejectedPrefix,
}
