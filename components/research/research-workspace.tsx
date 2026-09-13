"use client"

/**
 * Research Workspace Shell —— 第一屏的根，也是**唯一持有研究状态的地方**。
 *
 * ## `data-kits-pack` 为什么落在**这里**而不是 `<html>`
 *
 *  1. **作用域。** Style Pack 的 token 是 `[data-kits-pack="…"]` 作用域的，
 *     而其他路由（`/` 与 `/demo`）用的是 Factory 的中性 fallback。
 *     把 pack 放到 `<html>` 上会让那两条路由一起被重绘。
 *  2. **定位包含块。** 移动端的底部清单与处置抽屉是 `position: fixed`。
 *     把它们挂在 shell 元素下、而不是某个有 `transform` / `filter` 的容器里，
 *     是为了让它们相对视口定位。
 *
 * `data-kits-pack` 由**适配层**提供的常量填充（`lib/kits/adapters/data`），
 * 不是在这里写死的资产 id——产品源码禁止出现具体 pack 名，由
 * `factory-contract.spec.ts` 守着。
 *
 * ## 状态从 Phase E 起搬到了这里
 *
 * Phase D 的数据流是：Server Component 组装好，客户端只渲染。
 * Phase E 引入了处置——它会**改变 `ResearchData`**——所以：
 *
 * ```
 * page.tsx（Server）      交出 ResearchData（纯 JSON，可跨边界）
 *        ↓
 * ResearchWorkspace       持有它；每次变更后用 useMemo 重算组装结果
 *        ↓
 * ArgumentChain / Rail    只读 + 回调，不持有一份自己的副本
 * ```
 *
 * 重算而不是增量更新，是刻意的：派生值只有一个来源，增量更新等于
 * 手工维护第二份它们之间的关系。数据集只有几十条记录，重算的成本是零。
 *
 * ## 所有变更都走领域层
 *
 * 这个文件里没有一行业务规则——它只负责把 `outcome.data` 装回 state。
 * 守卫、轨迹、原子性全部在 `lib/research/operations.ts` 里，而**拒绝**
 * 是一条正常的返回值（`ok: false`），被原样交给界面显示。
 */

import { useMemo, useState } from "react"
import {
  acceptAiOutput,
  dispositionTension,
  rejectAiOutput,
  type DispositionIssue,
  type ResearchData,
  type TensionResolution,
} from "@/lib/research"
import { projectArgumentChain } from "@/lib/research-ui"
import { RESEARCH_LABELS, REVIEWER_COPY } from "@/lib/research-ui/copy"
import { stylePackId } from "@/lib/kits/adapters/data"
import { AnchoredQuestion } from "./anchored-question"
import { ArgumentChain } from "./argument-chain"
import { ResearchRunningHead } from "./running-head"
import type { ReviewerDecision } from "./reviewer-note"
/* Style Pack 的 CSS 缝。**必须显式 import**：适配层里那份 CSS 只是把 pack 的
 * tokens 引进来，它没有任何组件会去 import 它——不写这一行，pack 的
 * `--kits-space-*` / `--kits-border-*` / `--kits-radius-*` 就完全不存在，
 * 而页面**不会报错**：所有 `var(--kits-…)` 静默失效，边框宽度变成 0，
 * 只是看起来「有点平」。这是一次真实的静默失败，所以写在这里。
 *
 * 路径是**中性别名**（`adapters/style.css`），不是 `adapters/style-<pack>.css`：
 * 产品源码里出现具体 pack 名的那一刻，换 pack 就变成一次全量改引用，
 * 而且不会有任何东西报错。
 *
 * 这条路走适配层，不走 `installed/`。 */
import "@/lib/kits/adapters/style.css"
import "./research-shell.css"

type Outcome = { ok: true } | { ok: false; issues: DispositionIssue[] }

/**
 * 一次人工动作的时间戳。
 *
 * **这里刻意使用真实时间**，与数据集里的固定字面量相反。区别在于：
 * 数据集是夹具，必须逐位可复现；而「谁在什么时候接受了这个局限」
 * 是一件真实发生过的事，用假时间会让这条记录失去它唯一的用途。
 */
function now(): string {
  return new Date().toISOString()
}

export function ResearchWorkspace({ initialData }: { initialData: ResearchData }) {
  const [data, setData] = useState<ResearchData>(initialData)

  /* 每次数据变更后整体重算。不保留任何派生值的副本——见文件头。 */
  const chain = useMemo(
    () => projectArgumentChain(data, RESEARCH_LABELS, REVIEWER_COPY),
    [data],
  )

  const submitDisposition = (
    tensionId: string,
    resolution: TensionResolution,
    reason: string,
  ): Outcome => {
    const outcome = dispositionTension(data, tensionId, resolution, {
      actor: "human",
      at: now(),
      reason,
    })
    if (!outcome.ok) return { ok: false, issues: outcome.issues }
    setData(outcome.data)
    return { ok: true }
  }

  const decideReviewerNote = (
    noteId: string,
    decision: ReviewerDecision,
    reason: string,
  ): Outcome => {
    /* 采纳与驳回走两个不同的领域操作，但**都不改业务事实**。
       这个函数里没有任何一处写 claim / link / tension —— 它只有
       `outcome.data`，而那个 data 与输入只差一条 trace。 */
    const outcome =
      decision === "rejected"
        ? rejectAiOutput(data, noteId, { actor: "human", at: now(), reason })
        : acceptAiOutput(data, noteId, { actor: "human", at: now(), reason })
    if (!outcome.ok) return { ok: false, issues: outcome.issues }
    setData(outcome.data)
    return { ok: true }
  }

  return (
    <main
      className="rs-shell"
      data-kits-pack={stylePackId}
      data-testid="research-shell"
      /* 首屏那张「最大缺口」卡片已经讲过的**那一条**缺口，在链条里折叠掉——
         同一件事在 fold 以上说一遍、fold 以下再说一遍是重复，不是强调。
         判定靠这个显式标记（值是那条论断的 id），不是靠「是不是第一条论断」。 */
      data-suppressed-gap={chain.primaryGap?.claim.claim.id ?? undefined}
    >
      <ResearchRunningHead anchor={chain.anchor} />

      <div className="rs-main">
        <AnchoredQuestion text={chain.anchor.questionText} />
        <ArgumentChain
          chain={chain}
          onSubmitDisposition={submitDisposition}
          onReviewerDecision={decideReviewerNote}
        />
      </div>
    </main>
  )
}
